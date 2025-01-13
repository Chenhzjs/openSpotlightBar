#include "command.h"
#include <cstdio>

namespace Command {
    CommandParser::CommandParser() {
    }

    CommandParser::~CommandParser() {

    }

    CommandBase *CommandParser::parse(const QString &input, std::vector<std::string> &arguments) {
        for (const QString &prefix : commandMap.keys()) {
            if (input.startsWith(prefix)) {
                std::string arguments_builder = input.mid(prefix.length()).trimmed().toStdString();
                std::stringstream ss(arguments_builder);
                std::string token;
                // printf("Arguments: %s\n", arguments_builder.c_str());
                while (std::getline(ss, token, ' ')) {
                    arguments.push_back(token);
                }
                return commandMap[prefix];
            }
        }
        return nullptr;
    }

     
}