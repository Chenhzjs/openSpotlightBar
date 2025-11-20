#include "settingsdialog.h"
#include <QtWidgets/QVBoxLayout>
#include <QtWidgets/QLabel>
#include <QtWidgets/QPushButton>
#include <QtWidgets/QDialogButtonBox>
#include <QtWidgets/QGroupBox>
#include <QtCore/QStandardPaths>
#include <QtCore/QDir>
#include <QtCore/QUrl>
#include <QtCore/QFileInfo>
#include <QtGui/QDesktopServices>

namespace {
QString storageBasePath() {
    QString base = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
    if (base.isEmpty()) {
        base = QDir::homePath() + QStringLiteral("/.openSpotlightBar");
    }
    return base;
}
}

SettingsDialog::SettingsDialog(QWidget *parent)
    : QDialog(parent) {
    setWindowTitle(tr("Spotlight Settings"));
    setModal(false);
    setAttribute(Qt::WA_DeleteOnClose, false);
    setMinimumWidth(420);

    const QString base = storageBasePath();
    snippetsPath = base + QStringLiteral("/snippets.json");
    workflowsPath = base + QStringLiteral("/workflows.json");

    auto *mainLayout = new QVBoxLayout(this);
    mainLayout->setContentsMargins(24, 24, 24, 24);
    mainLayout->setSpacing(16);

    auto *infoLabel = new QLabel(tr("Configure your clipboard, snippets, and workflows here. "
                                    "Edit the JSON files or open their folders to sync with your own tools."));
    infoLabel->setWordWrap(true);
    mainLayout->addWidget(infoLabel);

    auto makeSection = [&](const QString &title, const QString &path, auto slot) {
        auto *section = new QGroupBox(title, this);
        auto *layout = new QVBoxLayout(section);
        auto *pathLabel = new QLabel(tr("Stored at: <code>%1</code>").arg(path.toHtmlEscaped()), section);
        pathLabel->setTextFormat(Qt::RichText);
        pathLabel->setTextInteractionFlags(Qt::TextBrowserInteraction | Qt::TextSelectableByMouse);
        layout->addWidget(pathLabel);
        auto *openButton = new QPushButton(tr("Open Folder"), section);
        connect(openButton, &QPushButton::clicked, this, slot);
        layout->addWidget(openButton);
        section->setLayout(layout);
        mainLayout->addWidget(section);
    };

    makeSection(tr("Snippets"), snippetsPath, [this]() { openSnippetsFolder(); });
    makeSection(tr("Workflows"), workflowsPath, [this]() { openWorkflowsFolder(); });

    auto *buttons = new QDialogButtonBox(QDialogButtonBox::Close, this);
    connect(buttons, &QDialogButtonBox::rejected, this, &SettingsDialog::close);
    mainLayout->addWidget(buttons);
}

void SettingsDialog::openSnippetsFolder() {
    QDesktopServices::openUrl(QUrl::fromLocalFile(QFileInfo(snippetsPath).absolutePath()));
}

void SettingsDialog::openWorkflowsFolder() {
    QDesktopServices::openUrl(QUrl::fromLocalFile(QFileInfo(workflowsPath).absolutePath()));
}
