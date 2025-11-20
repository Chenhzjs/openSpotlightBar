#include "search.h"
#include <QtCore/QDir>
#include <QtCore/QDirIterator>
#include <QtCore/QElapsedTimer>
#include <QtCore/QFileInfo>
#include <QtCore/QSet>
#include <QtCore/QStandardPaths>
#include <QtCore/QStringBuilder>
#include <QtWidgets/QListWidgetItem>
#include <QtCore/QProcess>
#include <algorithm>

namespace {
constexpr int kDefaultResultCount = 40;
constexpr int kIteratorSearchTimeBudgetMs = 1200;
}

static QString normalizedQuery(const QString &query) {
    return query.trimmed().toLower();
}

static QString relativePathForDisplay(const QString &absolutePath) {
    QString home = QStandardPaths::writableLocation(QStandardPaths::HomeLocation);
    if (!home.isEmpty() && absolutePath.startsWith(home)) {
        return QStringLiteral("~") + absolutePath.mid(home.length());
    }
    return absolutePath;
}

SearchEngine::SearchEngine() {
    const QString home = QStandardPaths::writableLocation(QStandardPaths::HomeLocation);
    addRootIfValid(home);
    addRootIfValid(QStandardPaths::writableLocation(QStandardPaths::DocumentsLocation));
    addRootIfValid(QStandardPaths::writableLocation(QStandardPaths::DesktopLocation));
    addRootIfValid(QStandardPaths::writableLocation(QStandardPaths::DownloadLocation));

#ifdef Q_OS_MAC
    addRootIfValid(QStringLiteral("/Applications"));
    addRootIfValid(home + QStringLiteral("/Applications"));
#endif
}

void SearchEngine::addRootIfValid(const QString &path) {
    if (path.isEmpty()) {
        return;
    }
    QFileInfo info(path);
    if (info.exists()) {
        roots.append(info.absoluteFilePath());
    }
}

QList<SearchResult> SearchEngine::search(const QString &query, int maxResults) {
    QList<SearchResult> results;
    if (query.trimmed().isEmpty()) {
        return results;
    }
    results = runNativeSearch(query, maxResults);
    if (results.isEmpty()) {
        results = runIteratorSearch(query, maxResults);
    }
    std::sort(results.begin(), results.end(), [](const SearchResult &a, const SearchResult &b) {
        if (a.score == b.score) {
            return a.name.toLower() < b.name.toLower();
        }
        return a.score > b.score;
    });
    if (results.size() > maxResults) {
        results = results.mid(0, maxResults);
    }
    return results;
}

QList<SearchResult> SearchEngine::runNativeSearch(const QString &query, int maxResults) {
    QList<SearchResult> nativeResults;
#ifdef Q_OS_MAC
    QProcess process;
    QString predicate = query.trimmed();
    if (predicate.isEmpty()) {
        return nativeResults;
    }
    process.start(QStringLiteral("mdfind"), QStringList{predicate});
    if (!process.waitForFinished(2500)) {
        process.kill();
        return nativeResults;
    }
    QString output = QString::fromUtf8(process.readAllStandardOutput());
    QStringList lines = output.split(QLatin1Char('\n'), Qt::SkipEmptyParts);
    for (const QString &rawLine : lines) {
        if (nativeResults.size() >= maxResults) {
            break;
        }
        const QString line = rawLine.trimmed();
        QFileInfo info(line);
        if (!info.exists()) {
            continue;
        }
        SearchResult result;
        result.path = info.absoluteFilePath();
        result.name = info.baseName().isEmpty() ? info.fileName() : info.baseName();
        result.isDirectory = info.isDir();
        result.isApplication = result.path.endsWith(QStringLiteral(".app"));
        result.score = score(result.name, query);
        nativeResults.append(result);
    }
#else
    Q_UNUSED(query);
    Q_UNUSED(maxResults);
#endif
    return nativeResults;
}

QList<SearchResult> SearchEngine::runIteratorSearch(const QString &query, int maxResults) {
    QList<SearchResult> results;
    const QString needle = normalizedQuery(query);
    QElapsedTimer timer;
    timer.start();
    QSet<QString> visited;
    for (const QString &root : std::as_const(roots)) {
        if (results.size() >= maxResults) {
            break;
        }
        QDirIterator it(
            root,
            QDir::AllEntries | QDir::NoDotAndDotDot | QDir::Readable,
            QDirIterator::Subdirectories);
        while (it.hasNext()) {
            const QString path = it.next();
            if (visited.contains(path)) {
                continue;
            }
            visited.insert(path);
            QFileInfo info = it.fileInfo();
            const QString candidate = info.fileName().toLower();
            if (!candidate.contains(needle)) {
                continue;
            }
            SearchResult result;
            result.path = info.absoluteFilePath();
            result.name = info.fileName();
            result.isDirectory = info.isDir();
            result.isApplication = result.path.endsWith(QStringLiteral(".app"));
            result.score = score(result.name, query);
            results.append(result);
            if (results.size() >= maxResults) {
                break;
            }
            if (timer.elapsed() > kIteratorSearchTimeBudgetMs) {
                return results;
            }
        }
        if (timer.elapsed() > kIteratorSearchTimeBudgetMs) {
            break;
        }
    }
    return results;
}

int SearchEngine::score(const QString &name, const QString &query) const {
    QString lowerName = name.toLower();
    QString lowerQuery = query.trimmed().toLower();
    if (lowerQuery.isEmpty()) {
        return 0;
    }
    if (lowerName == lowerQuery) {
        return 1000 - name.length();
    }
    if (lowerName.startsWith(lowerQuery)) {
        return 800 - (lowerName.length() - lowerQuery.length());
    }
    int idx = lowerName.indexOf(lowerQuery);
    if (idx >= 0) {
        return 600 - idx;
    }
    return 100;
}

Search::Search() : CommandBase(), engine() {
}

QList<SearchResult> Search::runSearch(const QString &query) {
    return engine.search(query, kDefaultResultCount);
}

void Search::displayResults(QListWidget *resultList, const QList<SearchResult> &results) {
    resultList->clear();
    if (results.isEmpty()) {
        resultList->addItem(QStringLiteral("No matches were found."));
        return;
    }
    for (const SearchResult &result : results) {
        QString prefix;
        if (result.isApplication) {
            prefix = QStringLiteral("[App] ");
        } else if (result.isDirectory) {
            prefix = QStringLiteral("[Folder] ");
        } else {
            prefix = QStringLiteral("[File] ");
        }
        QString label = prefix % result.name % QStringLiteral("  —  ") % relativePathForDisplay(result.path);
        QListWidgetItem *item = new QListWidgetItem(label);
        item->setData(Qt::UserRole, result.path);
        resultList->addItem(item);
    }
}

void Search::execute(const std::vector<std::string> &argument, QListWidget *resultList, QVBoxLayout * /*layout*/, QWidget * /*parent*/) {
    if (argument.empty()) {
        resultList->addItem(QStringLiteral("Usage: find <keywords>. Example: find notes"));
        return;
    }
    QStringList parts;
    for (const std::string &token : argument) {
        parts << QString::fromStdString(token);
    }
    const QString query = parts.join(QLatin1Char(' ')).trimmed();
    if (query.isEmpty()) {
        resultList->addItem(QStringLiteral("Please provide keywords to search for."));
        return;
    }
    resultList->addItem(QStringLiteral("Searching for \"%1\"...").arg(query));
    QList<SearchResult> results = runSearch(query);
    displayResults(resultList, results);
}
