#ifndef _GUI_H_
#define _GUI_H_
#include <QtWidgets/QApplication>
#include <QtWidgets/QLineEdit>
#include <QtWidgets/QListWidget>
#include <QtWidgets/QVBoxLayout>
#include <QtWidgets/QWidget>
#include "command.h"

namespace Window {
class Spotlight : public QWidget {
public:
    Spotlight(QWidget *parent);

    ~Spotlight() {
    }

private slots:
    void handleCommand();

private:
    QLineEdit *searchBox;
    QListWidget *resultList;
    Command::CommandParser parser;
};
}
#endif // _GUI_H_