#ifndef _GUI_H_
#define _GUI_H_
#include <QtWidgets/QAbstractItemView>
#include <QtWidgets/QApplication>
#include <QtWidgets/QFrame>
#include <QtWidgets/QGraphicsDropShadowEffect>
#include <QtWidgets/QLineEdit>
#include <QtWidgets/QListWidget>
#include <QtWidgets/QStyledItemDelegate>
#include <QtWidgets/QVBoxLayout>
#include <QtWidgets/QWidget>
#include <QtWidgets/QToolButton>
#include <QtWidgets/QHBoxLayout>
#include <QtWidgets/QSystemTrayIcon>
#include <QtWidgets/QMenu>
#include <QAction>
#include <QtGui/QDesktopServices>
#include <QtGui/QFontMetrics>
#include <QtGui/QKeyEvent>
#include <QtGui/QFocusEvent>
#include <QtGui/QPainter>
#include <QtGui/QIcon>
#include <QtGui/QPixmap>
#include <QtCore/QMargins>
#include <QtCore/QUrl>
#include <QtCore/QCoreApplication>
#include "command.h"
#include "clipboard.h"
#include "settingsdialog.h"
#ifdef Q_OS_MAC
#include <Carbon/Carbon.h>
#endif

class ResultItemDelegate : public QStyledItemDelegate {
public:
    explicit ResultItemDelegate(QObject *parent = nullptr) : QStyledItemDelegate(parent) {}

    void paint(QPainter *painter, const QStyleOptionViewItem &option, const QModelIndex &index) const override {
        QStyleOptionViewItem opt(option);
        initStyleOption(&opt, index);

        painter->save();
        painter->setRenderHint(QPainter::Antialiasing, true);

        QRectF backgroundRect = opt.rect.adjusted(6, 3, -6, -3);
        QColor background = (opt.state & QStyle::State_Selected) ? QColor(68, 122, 255, 210) : QColor(255, 255, 255, 25);
        painter->setPen(Qt::NoPen);
        painter->setBrush(background);
        painter->drawRoundedRect(backgroundRect, 12, 12);

        QString primaryText = opt.text.trimmed();
        QString secondaryText;
        const QString separator = QStringLiteral("  —  ");
        int separatorIndex = primaryText.indexOf(separator);
        if (separatorIndex != -1) {
            primaryText = opt.text.left(separatorIndex).trimmed();
            secondaryText = opt.text.mid(separatorIndex + separator.length()).trimmed();
        }

        QRectF textRect = backgroundRect.adjusted(14, 10, -14, -10);
        QFont primaryFont = opt.font;
        primaryFont.setPointSize(primaryFont.pointSize() + 1);
        primaryFont.setBold(true);

        painter->setFont(primaryFont);
        painter->setPen(QColor("#F5F5F7"));

        if (!secondaryText.isEmpty()) {
            QFontMetrics primaryMetrics(primaryFont);
            QRectF primaryRect = textRect;
            primaryRect.setHeight(primaryMetrics.height());
            painter->drawText(primaryRect, Qt::AlignLeft | Qt::AlignVCenter, primaryText);

            QFont secondaryFont = opt.font;
            painter->setFont(secondaryFont);
            painter->setPen(QColor(255, 255, 255, 180));
            QRectF secondaryRect = textRect;
            secondaryRect.setTop(primaryRect.bottom() + 4);
            painter->drawText(secondaryRect, Qt::AlignLeft | Qt::AlignVCenter, secondaryText);
        } else {
            painter->drawText(textRect, Qt::AlignLeft | Qt::AlignVCenter, primaryText);
        }

        painter->restore();
    }

    QSize sizeHint(const QStyleOptionViewItem &option, const QModelIndex &index) const override {
        QSize base = QStyledItemDelegate::sizeHint(option, index);
        base.setHeight(qMax(base.height(), 60));
        return base;
    }
};

class Spotlight : public QWidget {
public:
    Spotlight(QWidget *parent) : QWidget(parent), parser(commandParser), panel(nullptr), panelLayout(nullptr), resultsContainer(nullptr), settingsButton(nullptr), settingsDialog(nullptr), trayIcon(nullptr), trayMenu(nullptr), resultsVisible(false)
#ifdef Q_OS_MAC
    , hotKeyRef(nullptr), hotKeyHandler(nullptr), hotKeyUPP(nullptr)
#endif
    {
        setWindowFlags((windowFlags() | Qt::FramelessWindowHint | Qt::Tool) & ~Qt::WindowTitleHint);
        setAttribute(Qt::WA_TranslucentBackground, true);
        ClipboardManager::instance();
        initializeUi();
        applyPalette();
        applyStyles();
        adjustWindowSize();
#ifdef Q_OS_MAC
        registerGlobalHotkey();
#endif
        setupTrayIcon();
    }
    ~Spotlight() {
#ifdef Q_OS_MAC
        unregisterGlobalHotkey();
#endif
    }
private slots:
    void handleCommand() {
        QString input = searchBox->text().trimmed();
        searchBox->clear();
        if (input.isEmpty()) {
            return;
        }
        resetResults();
        adjustWindowSize();
        std::vector<std::string> arguments;
        CommandBase *command = parser.parse(input, arguments);
        if (command) {
            command->execute(arguments, resultList, layout, this);
        } else {
            resultList->addItem("Invalid command: " + input);
        }
        if (resultList->count() > 0) {
            ensureResultsVisible();
        }
        adjustWindowSize();
    }

    void handleResultActivated(QListWidgetItem *item) {
        if (!item) {
            return;
        }
        QVariant pathData = item->data(Qt::UserRole);
        if (!pathData.isValid()) {
            return;
        }
        const QString path = pathData.toString();
        if (path.isEmpty()) {
            return;
        }
        QDesktopServices::openUrl(QUrl::fromLocalFile(path));
    }

protected:
    void focusOutEvent(QFocusEvent *event) override {
        QWidget::focusOutEvent(event);
        if (settingsDialog && settingsDialog->isVisible() && settingsDialog->isActiveWindow()) {
            return;
        }
        if (!isActiveWindow()) {
            hideWindow();
        }
    }

    void keyPressEvent(QKeyEvent *event) override {
        if (event->key() == Qt::Key_Escape) {
            hideWindow();
            event->accept();
            return;
        }
        QWidget::keyPressEvent(event);
    }

private:
    QLineEdit *searchBox;
    QListWidget *resultList;
    QVBoxLayout *layout;
    QFrame *panel;
    QVBoxLayout *panelLayout;
    QFrame *resultsContainer;
    QToolButton *settingsButton;
    SettingsDialog *settingsDialog;
    QSystemTrayIcon *trayIcon;
    QMenu *trayMenu;
    CommandParser parser;
    bool resultsVisible;
#ifdef Q_OS_MAC
    EventHotKeyRef hotKeyRef;
    EventHandlerRef hotKeyHandler;
    EventHandlerUPP hotKeyUPP;
#endif

    void initializeUi() {
        setWindowTitle("Spotlight Search");
        setMinimumWidth(640);
        setAttribute(Qt::WA_StyledBackground, true);

        layout = new QVBoxLayout(this);
        layout->setContentsMargins(0, 0, 0, 0);
        layout->setSpacing(0);

        panel = new QFrame(this);
        panel->setObjectName("commandPanel");
        panel->setFrameShape(QFrame::NoFrame);

        panelLayout = new QVBoxLayout(panel);
        panelLayout->setContentsMargins(28, 24, 28, 24);
        panelLayout->setSpacing(16);

        auto *controlsLayout = new QHBoxLayout();
        controlsLayout->setContentsMargins(0, 0, 0, 0);
        controlsLayout->setSpacing(0);

        settingsButton = new QToolButton(panel);
        settingsButton->setObjectName("settingsButton");
        settingsButton->setCursor(Qt::PointingHandCursor);
        settingsButton->setToolTip(tr("Open Settings"));
        settingsButton->setText(QString::fromUtf8(u8"\u2699"));
        settingsButton->setFixedSize(32, 32);
#ifdef Q_OS_MAC
        settingsButton->setVisible(true);
#else
        settingsButton->setVisible(false);
#endif
        connect(settingsButton, &QToolButton::clicked, this, &Spotlight::openSettings);

        controlsLayout->addWidget(settingsButton, 0, Qt::AlignLeft);
        controlsLayout->addStretch();
        panelLayout->addLayout(controlsLayout);

        searchBox = new QLineEdit(panel);
        searchBox->setObjectName("commandInput");
        searchBox->setPlaceholderText("Type to search or run a command…");
        searchBox->setClearButtonEnabled(true);
        QFont searchFont = searchBox->font();
        searchFont.setPointSize(18);
        searchFont.setLetterSpacing(QFont::PercentageSpacing, 102);
        searchBox->setFont(searchFont);
        searchBox->setFixedHeight(56);
        connect(searchBox, &QLineEdit::returnPressed, this, &Spotlight::handleCommand);

        resultList = new QListWidget(panel);
        resultList->setObjectName("resultList");
        resultList->setSelectionMode(QAbstractItemView::SingleSelection);
        resultList->setSelectionBehavior(QAbstractItemView::SelectRows);
        resultList->setHorizontalScrollBarPolicy(Qt::ScrollBarAlwaysOff);
        resultList->setVerticalScrollMode(QAbstractItemView::ScrollPerPixel);
        resultList->setFrameShape(QFrame::NoFrame);
        resultList->setSpacing(8);
        resultList->setUniformItemSizes(false);
        resultList->setWordWrap(true);
        resultList->setItemDelegate(new ResultItemDelegate(resultList));
        resultList->setVisible(false);
        connect(resultList, &QListWidget::itemActivated, this, &Spotlight::handleResultActivated);

        panelLayout->addWidget(searchBox);

        resultsContainer = new QFrame(panel);
        resultsContainer->setObjectName("resultsContainer");
        resultsContainer->setVisible(false);
        QVBoxLayout *resultsLayout = new QVBoxLayout(resultsContainer);
        resultsLayout->setContentsMargins(12, 12, 12, 12);
        resultsLayout->setSpacing(0);
        resultsLayout->addWidget(resultList);

        panelLayout->addWidget(resultsContainer);
        layout->addWidget(panel);
    }

    void applyPalette() {
        QPalette pal = palette();
        pal.setColor(QPalette::Window, Qt::transparent);
        pal.setColor(QPalette::WindowText, QColor("#F5F5F7"));
        setPalette(pal);
        setAutoFillBackground(false);
    }

    void applyStyles() {
        setStyleSheet(R"(
            QWidget {
                color: #F5F5F7;
                font-family: "SF Pro Display", "Helvetica Neue", Arial;
            }
            QFrame#commandPanel {
                background-color: transparent;
                border-radius: 0;
            }
            QFrame#resultsContainer {
                background-color: rgba(8, 8, 12, 0.92);
                border-radius: 20px;
            }
            QFrame#resultsContainer QListWidget {
                border: none;
                background: transparent;
            }
            QLineEdit#commandInput {
                background-color: rgba(18, 18, 24, 0.92);
                border: none;
                border-radius: 16px;
                padding: 0 20px;
                color: #FFFFFF;
                selection-background-color: #427CFF;
                selection-color: #FFFFFF;
            }
            QLineEdit#commandInput:focus {
                background-color: rgba(25, 25, 32, 0.96);
            }
            QToolButton#settingsButton {
                border: none;
                color: #FFFFFF;
                font-size: 16px;
                background: transparent;
            }
            QToolButton#settingsButton:hover {
                color: #6FA0FF;
            }
            QListWidget#resultList {
                border: none;
                background: transparent;
            }
            QListWidget#resultList::item {
                margin: 4px 0;
            }
            QScrollBar:vertical {
                background: transparent;
                width: 10px;
                margin: 18px 0;
            }
            QScrollBar::handle:vertical {
                background: rgba(255, 255, 255, 0.25);
                border-radius: 5px;
            }
            QScrollBar::handle:vertical:hover {
                background: rgba(255, 255, 255, 0.35);
            }
            QScrollBar::add-line:vertical,
            QScrollBar::sub-line:vertical {
                height: 0;
            }
        )");
    }

    void ensureResultsVisible() {
        if (!resultsVisible) {
            resultsVisible = true;
            if (resultsContainer) {
                resultsContainer->setVisible(true);
            }
            resultList->setVisible(true);
        }
    }

    void resetResults() {
        resultList->clear();
        resultList->setVisible(false);
        if (resultsContainer) {
            resultsContainer->setVisible(false);
        }
        resultsVisible = false;
    }

    void adjustWindowSize() {
        if (!panel || !layout) {
            return;
        }
        const QMargins margins = layout->contentsMargins();
        const QSize panelHint = panel->sizeHint();
        const int minWidth = 680;
        const int targetWidth = qMax(minWidth, panelHint.width() + margins.left() + margins.right());
        const int naturalHeight = panelHint.height() + margins.top() + margins.bottom();
        const int maxHeight = 720;
        const int targetHeight = qMin(maxHeight, naturalHeight);
        resize(targetWidth, targetHeight);
    }

    void showWindowAndFocus() {
        show();
        raise();
        activateWindow();
        searchBox->setFocus();
    }

    void hideWindow() {
        resetResults();
        searchBox->clear();
        QWidget::hide();
        adjustWindowSize();
    }

#ifndef Q_OS_MAC
    void setupTrayIcon() {
        if (!QSystemTrayIcon::isSystemTrayAvailable()) {
            return;
        }
        if (trayIcon) {
            return;
        }
        trayIcon = new QSystemTrayIcon(createTrayIconIcon(), this);
        trayMenu = new QMenu(this);
        QAction *openAction = trayMenu->addAction(tr("Open Spotlight Bar"));
        connect(openAction, &QAction::triggered, this, &Spotlight::showWindowAndFocus);
        QAction *settingsAction = trayMenu->addAction(tr("Settings…"));
        connect(settingsAction, &QAction::triggered, this, &Spotlight::openSettings);
        trayMenu->addSeparator();
        QAction *quitAction = trayMenu->addAction(tr("Quit"));
        connect(quitAction, &QAction::triggered, qApp, &QCoreApplication::quit);
        trayIcon->setContextMenu(trayMenu);
        trayIcon->setToolTip(tr("SpotlightBar"));
        trayIcon->show();
    }
#else
    void setupTrayIcon() {}
#endif

    QIcon createTrayIconIcon() const {
        QPixmap pixmap(64, 64);
        pixmap.fill(Qt::transparent);
        QPainter painter(&pixmap);
        painter.setRenderHint(QPainter::Antialiasing, true);
        painter.setBrush(QColor(28, 28, 34));
        painter.setPen(Qt::NoPen);
        painter.drawRoundedRect(QRectF(4, 4, 56, 56), 18, 18);
        painter.setBrush(QColor("#5B8BFF"));
        painter.drawEllipse(QPointF(32, 32), 12, 12);
        return QIcon(pixmap);
    }

    void openSettings() {
        if (!settingsDialog) {
            settingsDialog = new SettingsDialog(this);
        }
        settingsDialog->show();
        settingsDialog->raise();
        settingsDialog->activateWindow();
    }

#ifdef Q_OS_MAC
    static OSStatus hotkeyCallback(EventHandlerCallRef, EventRef event, void *userData) {
        if (GetEventClass(event) == kEventClassKeyboard && GetEventKind(event) == kEventHotKeyPressed) {
            auto *spotlight = static_cast<Spotlight *>(userData);
            if (spotlight) {
                QMetaObject::invokeMethod(spotlight, [spotlight]() { spotlight->toggleVisibilityFromHotkey(); }, Qt::QueuedConnection);
            }
            return noErr;
        }
        return eventNotHandledErr;
    }

    void registerGlobalHotkey() {
        if (hotKeyRef) {
            return;
        }
        EventTypeSpec eventType;
        eventType.eventClass = kEventClassKeyboard;
        eventType.eventKind = kEventHotKeyPressed;
        hotKeyUPP = NewEventHandlerUPP(hotkeyCallback);
        InstallEventHandler(GetApplicationEventTarget(), hotKeyUPP, 1, &eventType, this, &hotKeyHandler);

        EventHotKeyID hotKeyID;
        hotKeyID.signature = 'OSB1';
        hotKeyID.id = 1;
        RegisterEventHotKey(kVK_Space, controlKey | optionKey, hotKeyID, GetApplicationEventTarget(), 0, &hotKeyRef);
    }

    void unregisterGlobalHotkey() {
        if (hotKeyRef) {
            UnregisterEventHotKey(hotKeyRef);
            hotKeyRef = nullptr;
        }
        if (hotKeyHandler) {
            RemoveEventHandler(hotKeyHandler);
            hotKeyHandler = nullptr;
        }
        if (hotKeyUPP) {
            DisposeEventHandlerUPP(hotKeyUPP);
            hotKeyUPP = nullptr;
        }
    }

    void toggleVisibilityFromHotkey() {
        if (isVisible() && isActiveWindow()) {
            hideWindow();
        } else {
            showWindowAndFocus();
        }
    }
#else
    void toggleVisibilityFromHotkey() {}
    void registerGlobalHotkey() {}
    void unregisterGlobalHotkey() {}
#endif
};

#endif // _GUI_H_
