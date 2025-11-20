#ifndef SETTINGSDIALOG_H
#define SETTINGSDIALOG_H

#include <QtWidgets/QDialog>

class SettingsDialog : public QDialog {
    Q_OBJECT
public:
    explicit SettingsDialog(QWidget *parent = nullptr);

private slots:
    void openSnippetsFolder();
    void openWorkflowsFolder();

private:
    QString snippetsPath;
    QString workflowsPath;
};

#endif
