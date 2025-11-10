#ifndef _GUI_H_
#define _GUI_H_
#include <QtWidgets/QApplication>
#include <QtWidgets/QLineEdit>
#include <QtWidgets/QListWidget>
#include <QtWidgets/QVBoxLayout>
#include <QtWidgets/QWidget>
#include "command.h"

class Spotlight : public QWidget {
public:
    Spotlight(QWidget *parent) : QWidget(parent), parser(commandParser) {
        setWindowTitle("Spotlight Search");
        setFixedSize(600, 400);

        searchBox = new QLineEdit(this);
        searchBox->setPlaceholderText("Type a command or search...");
        connect(searchBox, &QLineEdit::returnPressed, this, &Spotlight::handleCommand);

        resultList = new QListWidget(this);

        layout = new QVBoxLayout();
        layout->addWidget(searchBox);
        layout->addWidget(resultList);
        setLayout(layout);
    }

    ~Spotlight() {
        delete searchBox;
        delete resultList;
        delete layout;
    }

private slots:
    void handleCommand() {
        QString input = searchBox->text().trimmed();
        searchBox->clear();
        if (input.isEmpty()) {
            return;
        }
        std::vector<std::string> arguments;
        CommandBase *command = parser.parse(input, arguments);
        if (command) {
            command->execute(arguments, resultList, layout, this);
        } else {
            resultList->addItem("Invalid command: " + input);
        }
    }

private:
    QLineEdit *searchBox;
    QListWidget *resultList;
    QVBoxLayout *layout;
    CommandParser parser;
};

#endif // _GUI_H_
