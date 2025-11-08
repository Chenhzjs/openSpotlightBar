#ifndef _COMMAND_H_
#define _COMMAND_H_


#include <QtWidgets/QListWidget>
#include <QtWidgets/QVBoxLayout>
#include <QtWidgets/QWidget>
#include <string>
#include <vector>
#include <iostream>
#include <sstream>

namespace Command{

class CommandBase {
public:
    virtual ~CommandBase() = default;
    
    virtual void execute(const std::vector<std::string> &argument, QListWidget *resultList, QVBoxLayout *layout, QWidget *parent) = 0;
};

class CommandRegister {
public:
    // static CommandRegister& getInstance() {
    //     static CommandRegister commandRegister;
    //     return commandRegister;
    // }
    CommandRegister() {
        commandMap.clear();
    }
    void Register(const QString &prefix, CommandBase *command) {
        commandMap[prefix] = command;
        printf("Registering command: %s\n", prefix.toStdString().c_str());
        
    }

    ~CommandRegister() {
    }

    protected:
        QMap<QString, CommandBase *> commandMap;
};

class CommandParser : public CommandRegister {
public:
    static CommandParser& getInstance();

    CommandParser();

    ~CommandParser();

    CommandBase* parse(const QString &input, std::vector<std::string> &arguments);
};



}
#endif // _COMMAND_H_