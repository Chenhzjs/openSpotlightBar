#include "command.h"
#include "import.h"
#include "terminal.h"
namespace Command {

Terminal terminal;
void import() {
    printf("Importing Command...\n");
    terminal.registerCommand();
}
};
