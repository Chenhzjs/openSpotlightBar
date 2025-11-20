#include "snippet.h"
#include <QtCore/QDir>
#include <QtCore/QFile>
#include <QtCore/QJsonDocument>
#include <QtCore/QJsonObject>
#include <QtCore/QStandardPaths>
#include <QtCore/QStringList>
#include <QtGui/QClipboard>
#include <QtGui/QGuiApplication>
#include <QtWidgets/QListWidget>

SnippetRepository &SnippetRepository::instance() {
    static SnippetRepository repository;
    return repository;
}

SnippetRepository::SnippetRepository() : loaded(false) {
}

void SnippetRepository::ensureLoaded() const {
    if (!loaded) {
        loadFromDisk();
    }
}

QList<SnippetDefinition> SnippetRepository::all() {
    ensureLoaded();
    return snippets.values();
}

bool SnippetRepository::addOrUpdate(const QString &key, const QString &value) {
    if (key.trimmed().isEmpty()) {
        return false;
    }
    ensureLoaded();
    SnippetDefinition definition;
    definition.key = key.trimmed();
    definition.value = value;
    definition.updatedAt = QDateTime::currentDateTimeUtc();
    snippets.insert(definition.key, definition);
    return saveToDisk();
}

bool SnippetRepository::remove(const QString &key) {
    ensureLoaded();
    if (!snippets.contains(key)) {
        return false;
    }
    snippets.remove(key);
    return saveToDisk();
}

QString SnippetRepository::expand(const QString &key) const {
    ensureLoaded();
    if (!snippets.contains(key)) {
        return QString();
    }
    return snippets.value(key).value;
}

bool SnippetRepository::loadFromDisk() const {
    QFile file(storagePath());
    if (!file.exists()) {
        QDir dir(storageDirectory());
        if (!dir.exists()) {
            dir.mkpath(QStringLiteral("."));
        }
        QFile createFile(storagePath());
        if (createFile.open(QIODevice::WriteOnly | QIODevice::Truncate)) {
            createFile.write("{}");
            createFile.close();
        }
        snippets.clear();
        loaded = true;
        return true;
    }
    if (!file.open(QIODevice::ReadOnly)) {
        snippets.clear();
        loaded = true;
        return false;
    }
    const QByteArray data = file.readAll();
    file.close();
    QJsonParseError parseError;
    const QJsonDocument document = QJsonDocument::fromJson(data, &parseError);
    snippets.clear();
    if (parseError.error != QJsonParseError::NoError || !document.isObject()) {
        loaded = true;
        return false;
    }
    const QJsonObject root = document.object();
    for (auto it = root.constBegin(); it != root.constEnd(); ++it) {
        SnippetDefinition definition;
        definition.key = it.key();
        if (it.value().isObject()) {
            QJsonObject valueObject = it.value().toObject();
            definition.value = valueObject.value(QStringLiteral("value")).toString();
            definition.updatedAt = QDateTime::fromString(
                valueObject.value(QStringLiteral("updated")).toString(), Qt::ISODate);
        } else {
            definition.value = it.value().toString();
            definition.updatedAt = QDateTime::currentDateTimeUtc();
        }
        snippets.insert(definition.key, definition);
    }
    loaded = true;
    return true;
}

bool SnippetRepository::saveToDisk() const {
    QDir dir(storageDirectory());
    if (!dir.exists()) {
        dir.mkpath(QStringLiteral("."));
    }
    QFile file(storagePath());
    if (!file.open(QIODevice::WriteOnly | QIODevice::Truncate)) {
        return false;
    }
    QJsonObject root;
    for (auto it = snippets.constBegin(); it != snippets.constEnd(); ++it) {
        QJsonObject entry;
        entry.insert(QStringLiteral("value"), it.value().value);
        entry.insert(QStringLiteral("updated"), it.value().updatedAt.toString(Qt::ISODate));
        root.insert(it.key(), entry);
    }
    QJsonDocument document(root);
    file.write(document.toJson(QJsonDocument::Indented));
    file.close();
    return true;
}

QString SnippetRepository::storageDirectory() const {
    QString base = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
    if (base.isEmpty()) {
        base = QDir::homePath() + QStringLiteral("/.openSpotlightBar");
    }
    return base;
}

QString SnippetRepository::storagePath() const {
    return storageDirectory() + QStringLiteral("/snippets.json");
}

void SnippetCommand::execute(const std::vector<std::string> &argument, QListWidget *resultList, QVBoxLayout *, QWidget *) {
    SnippetRepository &repository = SnippetRepository::instance();

    if (argument.empty() || argument.front() == "list") {
        const QList<SnippetDefinition> entries = repository.all();
        if (entries.isEmpty()) {
            resultList->addItem(QStringLiteral("You have not configured any snippets yet."));
            resultList->addItem(QStringLiteral("Add one with: snip add hi Hello from Spotlight!"));
            return;
        }
        for (const SnippetDefinition &definition : entries) {
            QString line = QStringLiteral("%1 -> %2").arg(definition.key, definition.value.left(80));
            resultList->addItem(line);
        }
        return;
    }

    const std::string &cmd = argument.front();
    if (cmd == "add" && argument.size() > 2) {
        const QString key = QString::fromStdString(argument[1]);
        QStringList valueParts;
        for (size_t i = 2; i < argument.size(); ++i) {
            valueParts << QString::fromStdString(argument[i]);
        }
        const QString value = valueParts.join(QLatin1Char(' '));
        if (repository.addOrUpdate(key, value)) {
            resultList->addItem(QStringLiteral("Stored snippet \"%1\"").arg(key));
        } else {
            resultList->addItem(QStringLiteral("Unable to store snippet \"%1\"").arg(key));
        }
        return;
    }

    if ((cmd == "remove" || cmd == "rm") && argument.size() > 1) {
        const QString key = QString::fromStdString(argument[1]);
        if (repository.remove(key)) {
            resultList->addItem(QStringLiteral("Snippet \"%1\" removed.").arg(key));
        } else {
            resultList->addItem(QStringLiteral("No snippet found for \"%1\".").arg(key));
        }
        return;
    }

    if (cmd == "expand" || cmd == "use") {
        if (argument.size() < 2) {
            resultList->addItem(QStringLiteral("Usage: snip expand <key>"));
            return;
        }
        const QString key = QString::fromStdString(argument[1]);
        const QString value = repository.expand(key);
        if (value.isEmpty()) {
            resultList->addItem(QStringLiteral("No snippet stored for \"%1\".").arg(key));
            return;
        }
        QClipboard *clipboard = QGuiApplication::clipboard();
        if (clipboard) {
            clipboard->setText(value);
            resultList->addItem(QStringLiteral("Snippet \"%1\" copied to clipboard.").arg(key));
        } else {
            resultList->addItem(QStringLiteral("Clipboard unavailable. Snippet value:\n%1").arg(value));
        }
        return;
    }

    resultList->addItem(QStringLiteral("Unknown snippet command. Use: snip list | snip add <key> <value> | snip remove <key> | snip expand <key>."));
}
