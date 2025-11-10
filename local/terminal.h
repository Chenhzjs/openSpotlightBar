 #ifndef _LOCAL_TERMINAL_H_
 #define _LOCAL_TERMINAL_H_
#include "command.h"
#include <cstdlib>
#include <unistd.h>
#include <fstream>
#include <sys/types.h>

#ifdef __WIN32
#include <windows.h>
#endif

#include "file.h"
class Terminal : public CommandBase {
public:

    Terminal() {
    }

    void execute(const std::vector<std::string> &argument, QListWidget *resultList, QVBoxLayout *layout, QWidget *parent) override {
        resultList->addItem("Opening Terminal...");
#ifdef __WIN32
        openWindowsCmd();
#elif __APPLE__ || __linux__
        openUnixTerminal();
#endif
    }

private:
    void openUnixTerminal() {
#ifdef __APPLE__
        std::ifstream loadFile;
        std::string path = getDirectoryFromFILE(__FILE__);
        path += "/buf/terminal/";
        printf("%s\n", path.c_str());
        std::string terminal;
        terminal = getInfoFromFile(path, "terminal_valid.txt");
        if (terminal.find("iTerm2") != std::string::npos)
        {
            system("open -a iTerm");
        } else if (isExecutable("/Applications/iTerm.app/Contents/MacOS/iTerm2")) {
            if (!saveInfoToFile(path, "terminal_valid.txt", "iTerm2\n")) {
                printf("Failed to save terminal info\n");
            }
            system("open -a iTerm");
        } else {
            system("open -a Terminal");
        }
#elif __linux__
        system("gnome-terminal -x bash -c " exec bash;""); // for gnome
#endif
    }
    void openWindowsCmd() {
        system("start cmd");
    }

};

#endif
