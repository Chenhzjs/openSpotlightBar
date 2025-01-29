#include "command.h"
#include <cstdio>

namespace Command {

    
    CommandParser::CommandParser() {
    }

    CommandParser::~CommandParser() {

    }
    CommandParser& CommandParser::getInstance() {
        static CommandParser parser;
        // printf("access::%p\n", &parser);
        return parser;
    }
    CommandBase* CommandParser::parse(const QString &input, std::vector<std::string> &arguments) {
        // printf("parse::%p\n", &(getInstance()));
        for (const QString &prefix : getInstance().commandMap.keys()) {
            std::cout << "Prefix: " << prefix.toStdString() << std::endl;
            if (input.startsWith(prefix)) {
                std::string arguments_builder = input.mid(prefix.length()).trimmed().toStdString();
                std::stringstream ss(arguments_builder);
                std::string token;
                // printf("Arguments: %s\n", arguments_builder.c_str());
                while (std::getline(ss, token, ' ')) {
                    arguments.push_back(token);
                }
                // printf("command:: %p\n", getInstance().commandMap[prefix]);
                return getInstance().commandMap[prefix];
            }
        }
        return nullptr;
    }

     
}