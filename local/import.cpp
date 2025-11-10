#include "command.h"
#include "search.h"
#include "terminal.h"

struct ImportCommands {
    ImportCommands() {
        commandMap.insert("find", new Search());
        commandMap.insert("terminal", new Terminal());
    }
};