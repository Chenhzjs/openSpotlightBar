#ifndef _COMMAND_H_
#define _COMMAND_H_

#include <QtCore/QString>
#include <QtWidgets/QListWidget>
#include <string>
#include <vector>
#include <iostream>
#include <sstream>

namespace Command{

class CommandBase {
public:
    virtual ~CommandBase() = default;
    
    virtual void execute(const std::vector<std::string> &argument, QListWidget *resultList) = 0;
};

class CommandRegister {
public:
    CommandRegister() {
        commandMap.clear();
    }
    void Register(const QString &prefix, CommandBase *command) {
        commandMap[prefix] = command;
    }

    ~CommandRegister() {
    }

    protected:
        QMap<QString, CommandBase *> commandMap;
};

class CommandParser : public CommandRegister {
public:
    static CommandParser& getInstance() {
        static CommandParser parser;
        return parser;
    }

    CommandParser();

    ~CommandParser();

    CommandBase *parse(const QString &input, std::vector<std::string> &arguments);
};



}
#endif // _COMMAND_H_