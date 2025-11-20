#include "help.h"
#include <QtCore/QStringBuilder>

QVector<HelpEntry> HelpCommand::entries() const {
    return QVector<HelpEntry>{
        {QStringLiteral("find <keywords>"), QStringLiteral("Search for apps, files, or folders. Double-click a result to open it."), QStringLiteral("find notes report")},
        {QStringLiteral("terminal"), QStringLiteral("Open your preferred terminal emulator."), QString()},
        {QStringLiteral("clip list | clip copy <n> | clip clear"), QStringLiteral("Review clipboard history, restore an item, or clear the log."), QStringLiteral("clip copy 2")},
        {QStringLiteral("snip add/list/remove/expand"), QStringLiteral("Manage reusable text snippets stored locally."), QStringLiteral("snip add brb Be right back!")},
        {QStringLiteral("workflow list/reload/<keyword>"), QStringLiteral("Run custom automations defined in workflows.json."), QStringLiteral("workflow web open spotlight alternatives")},
        {QStringLiteral("help"), QStringLiteral("Show this overview."), QStringLiteral("help")}
    };
}

void HelpCommand::execute(const std::vector<std::string> &, QListWidget *resultList, QVBoxLayout *, QWidget *) {
    resultList->clear();
    resultList->addItem(QStringLiteral("SpotlightBar commands:"));
    for (const HelpEntry &entry : entries()) {
        QString line = entry.command;
        if (!entry.description.isEmpty()) {
            line += QStringLiteral(" — ") + entry.description;
        }
        resultList->addItem(line);
        if (!entry.example.isEmpty()) {
            resultList->addItem(QStringLiteral("   e.g. %1").arg(entry.example));
        }
    }
    resultList->addItem(QStringLiteral("Tip: Type a prefix (e.g. \"find\") and press Enter to run it."));
}
