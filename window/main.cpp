#include "gui.h"
#include "command.h"
#include "import.h"
#include <cstdio>

int main(int argc, char *argv[]) {
    QApplication app(argc, argv);
    Window::Spotlight spotlight(nullptr);
    // printf("main::%p\n", &(Command::CommandParser::getInstance()));
    Command::import();
    spotlight.show();
    return app.exec();
}