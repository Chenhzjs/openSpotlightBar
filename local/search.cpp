#include "command.h"
#include <cstdlib>
#include <unistd.h>
#include <fstream>
#include <sys/types.h>

#ifdef __WIN32
#include <windows.h>
#endif

#include "file.h"
namespace Command {
class Search : public CommandBase {
public:
    Search() {
        CommandParser::getInstance().Register("find", this);
    }
    void execute(const std::vector<std::string> &argument, QListWidget *resultList, QVBoxLayout *layout, QWidget *parent) override {
        resultList->addItem("Now finding...");
#ifdef __WIN32

#elif __APPLE__ || __linux__

#endif
    }

private:
    

};
Search search;
};