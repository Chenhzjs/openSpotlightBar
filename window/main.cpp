#include "gui.h"
#include "command.h"
#include <cstdio>

int main(int argc, char *argv[]) {
    QApplication app(argc, argv);
    Window::Spotlight spotlight(nullptr);
    spotlight.show();
    return app.exec();
}