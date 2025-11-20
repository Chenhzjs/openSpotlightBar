#include "command.h"
#include "search.h"
#include "terminal.h"
#include "clipboard.h"
#include "snippet.h"
#include "workflow.h"
#include "help.h"

struct ImportCommands {
    ImportCommands() {
        commandMap.insert("find", new Search());
        commandMap.insert("terminal", new Terminal());
        commandMap.insert("clip", new ClipboardCommand());
        commandMap.insert("clipboard", new ClipboardCommand());
        commandMap.insert("snip", new SnippetCommand());
        commandMap.insert("snippet", new SnippetCommand());
        commandMap.insert("workflow", new WorkflowCommand());
        commandMap.insert("wf", new WorkflowCommand());
        commandMap.insert("help", new HelpCommand());
    }
};

static ImportCommands importCommandsInstance;
