#include <QtWidgets/QApplication>
#include <QtWidgets/QLineEdit>
#include <QtWidgets/QListWidget>
#include <QtWidgets/QVBoxLayout>
#include <QtWidgets/QWidget>
#include "command.h"
#include "gui.h"

namespace Window {
    Spotlight::Spotlight(QWidget *parent) : QWidget(parent), parser(Command::CommandParser::getInstance()) {
        setWindowTitle("Spotlight Search");
        setFixedSize(600, 400);

        searchBox = new QLineEdit(this);
        searchBox->setPlaceholderText("Type a command or search...");
        connect(searchBox, &QLineEdit::returnPressed, this, &Spotlight::handleCommand);

        resultList = new QListWidget(this);

        QVBoxLayout *layout = new QVBoxLayout();
        layout->addWidget(searchBox);
        layout->addWidget(resultList);
        setLayout(layout);
    }
    void Spotlight::handleCommand() {
        QString input = searchBox->text().trimmed();
        searchBox->clear();
        if (input.isEmpty()) {
            return;
        }

        std::vector<std::string> arguments;
        Command::CommandBase *command = parser.parse(input, arguments);
        if (command) {
            command->execute(arguments, resultList);
        } else {
            resultList->addItem("Invalid command: " + input);
        }
    }
}