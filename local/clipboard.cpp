#include "clipboard.h"
#include <QtCore/QMimeData>
#include <QtCore/QStandardPaths>
#include <QtCore/QUrl>
#include <QtGui/QGuiApplication>
#include <QtWidgets/QListWidget>

namespace {
constexpr int kPreviewLength = 80;
}

ClipboardManager &ClipboardManager::instance() {
    static ClipboardManager manager;
    return manager;
}

ClipboardManager::ClipboardManager()
    : QObject(QGuiApplication::instance()),
      clipboard(QGuiApplication::clipboard()),
      maxItems(40) {
    if (clipboard) {
        connect(clipboard, &QClipboard::dataChanged, this, &ClipboardManager::handleDataChanged);
    }
}

const QVector<ClipboardEntry> &ClipboardManager::history() const {
    return entries;
}

bool ClipboardManager::copyEntry(int index) {
    if (!clipboard) {
        return false;
    }
    if (index < 0 || index >= entries.size()) {
        return false;
    }
    const ClipboardEntry &entry = entries.at(index);
    if (!entry.isText) {
        return false;
    }
    clipboard->setText(entry.payload);
    return true;
}

void ClipboardManager::clear() {
    entries.clear();
}

void ClipboardManager::handleDataChanged() {
    if (!clipboard) {
        return;
    }
    const QMimeData *mimeData = clipboard->mimeData();
    if (!mimeData) {
        return;
    }

    ClipboardEntry entry;
    entry.timestamp = QDateTime::currentDateTime();
    entry.isText = false;

    if (mimeData->hasText()) {
        entry.payload = mimeData->text();
        entry.preview = entry.payload.left(kPreviewLength);
        entry.category = QStringLiteral("Text");
        entry.isText = true;
    } else if (mimeData->hasUrls()) {
        const QList<QUrl> urls = mimeData->urls();
        if (!urls.isEmpty()) {
            entry.preview = urls.first().toString();
            entry.category = QStringLiteral("Link");
        }
    } else if (mimeData->hasImage()) {
        entry.preview = QStringLiteral("[Image]");
        entry.category = QStringLiteral("Image");
    }

    if (entry.preview.isEmpty()) {
        return;
    }
    appendEntry(entry);
}

void ClipboardManager::appendEntry(const ClipboardEntry &entry) {
    if (!entries.isEmpty()) {
        const ClipboardEntry &current = entries.first();
        if (current.preview == entry.preview && current.category == entry.category && current.payload == entry.payload) {
            return;
        }
    }
    entries.prepend(entry);
    if (entries.size() > maxItems) {
        entries.removeLast();
    }
}

void ClipboardCommand::execute(const std::vector<std::string> &argument, QListWidget *resultList, QVBoxLayout *, QWidget *) {
    ClipboardManager &manager = ClipboardManager::instance();

    auto printHistory = [&manager, resultList]() {
        const QVector<ClipboardEntry> &items = manager.history();
        if (items.isEmpty()) {
            resultList->addItem(QStringLiteral("Clipboard history is empty."));
            return;
        }
        for (int i = 0; i < items.size(); ++i) {
            const ClipboardEntry &entry = items.at(i);
            QString label = QStringLiteral("#%1 [%2] %3").arg(i).arg(entry.category, entry.preview);
            QListWidgetItem *item = new QListWidgetItem(label);
            if (entry.isText) {
                item->setData(Qt::UserRole, entry.payload);
            }
            resultList->addItem(item);
        }
        resultList->addItem(QStringLiteral("Use \"clip copy <index>\" to copy an entry back to the clipboard."));
    };

    if (argument.empty() || argument.front() == "list") {
        printHistory();
        return;
    }

    const std::string &first = argument.front();
    if (first == "copy" && argument.size() > 1) {
        bool ok = false;
        int index = QString::fromStdString(argument[1]).toInt(&ok);
        if (!ok) {
            resultList->addItem(QStringLiteral("Invalid index."));
            return;
        }
        if (manager.copyEntry(index)) {
            resultList->addItem(QStringLiteral("Entry #%1 copied back to the clipboard.").arg(index));
        } else {
            resultList->addItem(QStringLiteral("Unable to copy entry #%1. Only text entries are supported.").arg(index));
        }
        return;
    }

    if (first == "clear") {
        manager.clear();
        resultList->addItem(QStringLiteral("Clipboard history cleared."));
        return;
    }

    resultList->addItem(QStringLiteral("Unknown clipboard action. Available: clip list, clip copy <index>, clip clear."));
}
