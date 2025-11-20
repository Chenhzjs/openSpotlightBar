#ifndef _COMMAND_H_
#define _COMMAND_H_


#include <QtWidgets/QListWidget>
#include <QtWidgets/QVBoxLayout>
#include <QtWidgets/QWidget>
#include <QtCore/QRegularExpression>
#include <string>
#include <vector>
#include <sstream>
#include <algorithm>

extern QMap<QString, class CommandBase *> commandMap;

class CommandBase {
public:
    virtual ~CommandBase() = default;
    virtual void execute(const std::vector<std::string> &argument, QListWidget *resultList, QVBoxLayout *layout, QWidget *parent) = 0;
};

class CommandParser {
public:

    CommandBase* parse(const QString &input, std::vector<std::string> &arguments) {
        const QString trimmed = input.trimmed();
        auto keys = commandMap.keys();
        std::sort(keys.begin(), keys.end(), [](const QString &lhs, const QString &rhs) {
            if (lhs.length() == rhs.length()) {
                return lhs < rhs;
            }
            return lhs.length() > rhs.length();
        });
        for (const QString &prefix : keys) {
            if (!trimmed.startsWith(prefix, Qt::CaseInsensitive)) {
                continue;
            }
            if (trimmed.length() > prefix.length() && !trimmed.at(prefix.length()).isSpace()) {
                continue;
            }
            const QString remaining = trimmed.mid(prefix.length()).trimmed();
            const QStringList tokens = remaining.split(QRegularExpression(QStringLiteral("\\s+")), Qt::SkipEmptyParts);
            for (const QString &token : tokens) {
                arguments.push_back(token.toStdString());
            }
            return commandMap[prefix];
        }
        return nullptr;
    }
};

extern CommandParser commandParser;
#endif // _COMMAND_H_
