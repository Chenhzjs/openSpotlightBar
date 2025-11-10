#ifndef _COMMAND_H_
#define _COMMAND_H_


#include <QtWidgets/QListWidget>
#include <QtWidgets/QVBoxLayout>
#include <QtWidgets/QWidget>
#include <string>
#include <vector>
#include <iostream>
#include <sstream>

extern QMap<QString, class CommandBase *> commandMap;

class CommandBase {
public:
    virtual ~CommandBase() = default;
    virtual void execute(const std::vector<std::string> &argument, QListWidget *resultList, QVBoxLayout *layout, QWidget *parent) = 0;
};

class CommandParser {
public:

    CommandBase* parse(const QString &input, std::vector<std::string> &arguments) {
        for (const QString &prefix : commandMap.keys()) {
            std::cout << "Prefix: " << prefix.toStdString() << std::endl;
            if (input.startsWith(prefix)) {
                std::string arguments_builder = input.mid(prefix.length()).trimmed().toStdString();
                std::stringstream ss(arguments_builder);
                std::string token;
                while (std::getline(ss, token, ' ')) {
                    arguments.push_back(token);
                }
                return commandMap[prefix];
            }
        }
        return nullptr;
    }
};

extern CommandParser commandParser;
#endif // _COMMAND_H_
