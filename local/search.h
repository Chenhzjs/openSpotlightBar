#ifndef _SEARCH_H_
#define _SEARCH_H_
#include "command.h"
#include "file.h"
#include <cstdlib>
#include <unistd.h>
#include <fstream>
#include <sys/types.h>

#ifdef __WIN32
#include <windows.h>
#endif

class Search : public CommandBase {
public:
    void execute(const std::vector<std::string> &argument, QListWidget *resultList, QVBoxLayout *layout, QWidget *parent) override {
        resultList->addItem("Now finding...");
#ifdef __WIN32

#elif __APPLE__ || __linux__

#endif
    }

private:
    

};


#endif
