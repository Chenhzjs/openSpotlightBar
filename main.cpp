#include "gui.h"
#include "command.h"
#include <cstdio>

int main(int argc, char *argv[]) {
    QApplication app(argc, argv);
    Spotlight spotlight(nullptr);
    spotlight.show();
    return app.exec();
}