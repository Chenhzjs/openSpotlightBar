#include "command.h"
#include <cstdlib>
#include <unistd.h>
#include <sys/types.h>
namespace Command {
class Terminal : public CommandBase {
public:
    Terminal() {
        CommandParser::getInstance().Register("term", this);
    }
    void execute(const std::vector<std::string> &argument, QListWidget *resultList) override {
        resultList->addItem("Opening Terminal...");
        system("open -a iTerm");

    }
};
Terminal terminal;
};