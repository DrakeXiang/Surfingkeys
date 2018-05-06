var Front = (function() {
    var self = new Mode("Front");

    // this object is implementation of UI, it's UI provider
    self.isProvider = function() {
        return true;
    };

    var topOrigin,
        _actions = {},
        _callbacks = {};
    self.contentCommand = function(args, successById) {
        args.commandToContent = true;
        args.id = generateQuickGuid();
        if (successById) {
            args.ack = true;
            _callbacks[args.id] = successById;
        }
        top.postMessage(args, topOrigin);
    };

    self.addEventListener('keydown', function(event) {
        if (Mode.isSpecialKeyOf("<Esc>", event.sk_keyName)) {
            self.hidePopup();
            event.sk_stopPropagation = true;
        } else {
            if (_tabs.trie) {
                _tabs.trie = _tabs.trie.find(event.sk_keyName);
                if (!_tabs.trie) {
                    self.hidePopup();
                    _tabs.trie = null;
                } else if (_tabs.trie.meta) {
                    RUNTIME('focusTab', {
                        tab_id: _tabs.trie.meta.id,
                        window_id: _tabs.trie.meta.windowId
                    });
                    self.hidePopup();
                    _tabs.trie = null;
                }
                event.sk_stopPropagation = true;
            }
        }
    });

    self.flush = function() {
        var visibleDivs = Array.from(document.body.querySelectorAll("body>div")).filter(function(n) {
            return n.style.display !== "none";
        });
        var pointerEvents = visibleDivs.map(function(d) {
            var id = d.id;
            var divNoPointerEvents = ["sk_keystroke", "sk_bubble", "sk_banner", "sk_frame"];
            if (divNoPointerEvents.indexOf(id) !== -1) {
                // no pointerEvents for bubble
                return false;
            } else if (id === "sk_status") {
                // only pointerEvents when input in statusBar
                return self.statusBar.querySelector('input') !== null;
            } else {
                // with pointerEvents for all other DIVs
                return true;
            }
        });
        // to make pointerEvents not empty
        pointerEvents.push(false);
        pointerEvents = pointerEvents.reduce(function(a, b) {
            return a || b;
        });
        if (pointerEvents) {
            window.focus();
            visibleDivs[0].focus();
        }
        top.postMessage({
            action: 'setFrontFrame',
            pointerEvents: pointerEvents ? "all" : "none",
            frameHeight: visibleDivs.length > 0 ? "100%" : "0px"
        }, topOrigin);
    };
    self.visualCommand = function(args) {
        if (_usage.style.display !== "none") {
            // visual mode in frontend.html
            Visual[args.action](args.query);
        } else {
            // visual mode for all content windows
            self.contentCommand(args);
        }
    };

    self.omnibar = document.getElementById('sk_omnibar');
    self.statusBar = document.getElementById('sk_status');
    var frameElement = document.getElementById('sk_frame');
    var _usage = document.getElementById('sk_usage');
    var _popup = document.getElementById('sk_popup');
    var _editor = document.getElementById('sk_editor');
    var _tabs = document.getElementById('sk_tabs');
    var banner = document.getElementById('sk_banner');
    var _bubble = document.getElementById('sk_bubble');
    var keystroke = document.getElementById('sk_keystroke');

    var _display;
    _actions['hidePopup'] = function() {
        if (_display && _display.style.display !== "none") {
            _display.style.display = "none";
            self.flush();
            _display.onHide && _display.onHide();
            self.exit();
        }
    };
    self.hidePopup = _actions['hidePopup'];

    function showPopup(td, args) {
        self.enter(0, true);
        if (_display && _display.style.display !== "none") {
            _display.style.display = "none";
            _display.onHide && _display.onHide();
        }
        _display = td;
        _display.style.display = "";
        _display.onShow && _display.onShow(args);
        self.flush();
    }

    _actions['highlightElement'] = function(message) {
        var rect = message.rect;
        frameElement.style.top = rect.top + "px";
        frameElement.style.left = rect.left + "px";
        frameElement.style.width = rect.width + "px";
        frameElement.style.height = rect.height + "px";
        frameElement.style.display = "";
        self.flush();
        setTimeout(function() {
            frameElement.style.display = "none";
            self.flush();
        }, message.duration);
    };

    _tabs.onShow = function(tabs) {
        setInnerHTML(_tabs, "");
        _tabs.trie = new Trie();
        var hintLabels = Hints.genLabels(tabs.length);
        var tabstr = "<div class=sk_tab style='width: 200px'>";
        tabs.forEach(function(t, i) {
            var tab = createElement(tabstr);
            _tabs.trie.add(hintLabels[i].toLowerCase(), t);
            setInnerHTML(tab, `<div class=sk_tab_hint>${hintLabels[i]}</div><div class=sk_tab_wrap><div class=sk_tab_icon><img src='chrome://favicon/${t.url}'></div><div class=sk_tab_title>${htmlEncode(t.title)}</div></div>`);
            tab.url = t.url;
            _tabs.append(tab);
        });
        _tabs.querySelectorAll('div.sk_tab').forEach(function(tab) {
            tab.append(createElement(`<div class=sk_tab_url>${tab.url}</div>`));
        });
    };
    _actions['chooseTab'] = function() {
        runtime.command({
            action: 'getTabs'
        }, function(response) {
            if (response.tabs.length > runtime.conf.tabsThreshold) {
                showPopup(self.omnibar, {type: 'Tabs'});
            } else if (response.tabs.length > 0) {
                showPopup(_tabs, response.tabs);
            }
        });
    };

    function buildUsage(metas, cb) {
        var feature_groups = [
            'Help',                  // 0
            'Mouse Click',           // 1
            'Scroll Page / Element', // 2
            'Tabs',                  // 3
            'Page Navigation',       // 4
            'Sessions',              // 5
            'Search selected with',  // 6
            'Clipboard',             // 7
            'Omnibar',               // 8
            'Visual Mode',           // 9
            'vim-like marks',        // 10
            'Settings',              // 11
            'Chrome URLs',           // 12
            'Proxy',                 // 13
            'Misc',                  // 14
            'Insert Mode',           // 15
        ];

        initL10n(function(locale) {
            var help_groups = feature_groups.map(function(){return [];});
            help_groups[0].push("<div><span class=kbd-span><kbd>&lt;Alt-s&gt;</kbd></span><span class=annotation>{0}</span></div>".format(locale("Toggle SurfingKeys on current site")));

            metas = metas.concat(getAnnotations(Omnibar.mappings));
            metas.forEach(function(meta) {
                var w = KeyboardUtils.decodeKeystroke(meta.word);
                var item = `<div><span class=kbd-span><kbd>${htmlEncode(w)}</kbd></span><span class=annotation>${locale(meta.annotation)}</span></div>`;
                help_groups[meta.feature_group].push(item);
            });
            help_groups = help_groups.map(function(g, i) {
                if (g.length) {
                    return "<div><div class=feature_name><span>{0}</span></div>{1}</div>".format(locale(feature_groups[i]), g.join(''));
                } else {
                    return "";
                }
            }).join("");

            help_groups += `<p style='float:right; width:100%; text-align:right'><a href='https://github.com/brookhong/surfingkeys' target='_blank' style='color:#0095dd'>${locale("More help")}</a></p>`;
            cb(help_groups);
        });
    }

    _usage.onShow = function(message) {
        buildUsage(message.metas, function(usage) {
            setInnerHTML(_usage, usage);
        });
    };

    _actions['showUsage'] = function(message) {
        showPopup(_usage, message);
    };
    _actions['applyUserSettings'] = function (message) {
        for (var k in message.userSettings) {
            if (runtime.conf.hasOwnProperty(k)) {
                runtime.conf[k] = message.userSettings[k];
            }
        }
        if ('theme' in message.userSettings) {
            setInnerHTML(document.getElementById("sk_theme"), message.userSettings.theme);
        }
    };
    _actions['executeCommand'] = function (message) {
        Commands.execute(message.cmdline);
    };
    _actions['addCMap'] = function (message) {
        _map(Omnibar, message.new_keystroke, message.old_keystroke);
    };
    _actions['addVimMap'] = function (message) {
        self.vimMappings.push([message.lhs, message.rhs, message.ctx]);
    };
    _actions['addVimKeyMap'] = function (message) {
        self.vimKeyMap = message.vimKeyMap;
    };
    _actions['addSearchAlias'] = function (message) {
        SearchEngine.aliases[message.alias] = {
            prompt: '' + message.prompt + separatorHtml,
            url: message.url,
            suggestionURL: message.suggestionURL
        };
    };
    _actions['removeSearchAlias'] = function (message) {
        delete SearchEngine.aliases[message.alias];
    };
    _actions['getUsage'] = function (message) {
        // send response in callback from buildUsage
        delete message.ack;
        buildUsage(message.metas, function(usage) {
            top.postMessage({
                data: usage,
                action: message.action + "Ack",
                responseToContent: message.commandToFrontend,
                id: message.id
            }, topOrigin);
        });
    };

    self.showUsage = self.hidePopup;

    _actions['showPopup'] = function(message) {
        self.showPopup(message.content);
    };

    self.showPopup = function(content) {
        setInnerHTML(_popup, content);
        showPopup(_popup);
    };

    self.vimMappings = [];
    _editor.onShow = function(message) {
        if (typeof(AceEditor) !== "undefined") {
            AceEditor.show(message);
        } else {
            Normal.insertJS('../libs/ace/ace.js', function() {
                ace.config.set('workerPath', "../libs/ace");
                ace.config.set('modePath', "../libs/ace");
                ace.config.set('themePath', "../libs/ace");
                ace.config.set('basePath', "../libs/ace");
                Normal.insertJS('editor.js', function() {
                    AceEditor.show(message);
                });
            });
        }
    };
    _actions['showEditor'] = function(message) {
        if (message.onEditorSaved) {
            self.onEditorSaved = message.onEditorSaved;
        }
        showPopup(_editor, message);
    };
    self.showEditor = _actions['showEditor'];
    _actions['updateOmnibarResult'] = function(message) {
        Omnibar.listWords(message.words);
    };
    _actions['openOmnibar'] = function(message) {
        showPopup(self.omnibar, message);
        var style = message.style || "";
        setInnerHTML(self.omnibar.querySelector('style'), `#sk_omnibar {${style}}`);
    };
    self.openOmnibar = _actions['openOmnibar'];
    _actions['openFinder'] = function() {
        Find.open();
    };
    self.openFinder = _actions['openFinder'];

    self.showBanner = function (content, linger_time) {
        banner.classList.remove("slideInBanner");
        banner.style.display = "";
        setInnerHTML(banner, htmlEncode(content));
        self.flush();

        banner.classList.add("slideInBanner");
        banner.one('animationend', function() {
            banner.classList.remove("slideInBanner");
            banner.style.display = "none";
            self.flush();
        });
    };
    _actions['showBanner'] = function(message) {
        self.showBanner(message.content, message.linger_time);
    };
    _actions['showBubble'] = function(message) {
        var pos = message.position;
        setInnerHTML(_bubble.querySelector('div.sk_bubble_content'), message.content);
        _bubble.style.display = "";
        self.flush();
        var w = _bubble.offsetWidth,
            h = _bubble.offsetHeight;
        var left = [pos.left - 11 - w / 2, w / 2];
        if (left[0] < 0) {
            left[1] += left[0];
            left[0] = 0;
        } else if ((left[0] + w) > window.innerWidth) {
            left[1] += left[0] - window.innerWidth + w;
            left[0] = window.innerWidth - w;
        }
        var arrow = _bubble.querySelector('div.sk_arrow');
        if (pos.top - h >= 0) {
            arrow.setAttribute("dir", "down");
            arrow.style.top = "100%";
            _bubble.style.top = (pos.top - h - pos.height) + "px";
            _bubble.style.left = left[0] + "px";
        } else {
            arrow.setAttribute("dir", "up");
            arrow.style.top = "-12px";
            _bubble.style.top = pos.top + pos.height + 12 + "px";
            _bubble.style.left = left[0] + "px";
        }
        arrow.style.left = left[1] + "px";
    };
    self.showBubble = function() {
    };

    _actions['hideBubble'] = function() {
        _bubble.style.display = "none";
        self.flush();
    };
    self.hideBubble = _actions['hideBubble'];

    _actions['visualUpdatedForFirefox'] = function(message) {
        self.statusBar.querySelector('input').focus();
    };

    _actions['showStatus'] = function(message) {
        if (Mode.stack()[0] !== Find) {
            self.showStatus(message.position, message.content, message.duration);
        }
    };
    self.showStatus = function(position, content, duration) {
        StatusBar.show(position, content, duration);
    };

    self.toggleStatus = function(visible) {
        if (visible) {
            self.statusBar.style.display = "";
        } else {
            self.statusBar.style.display = "none";
        }
    };
    _actions['toggleStatus'] = function(message) {
        self.toggleStatus(message.visible);
    };

    var _pendingHint;
    function clearPendingHint() {
        if (_pendingHint) {
            clearTimeout(_pendingHint);
            _pendingHint = undefined;
        }
    }

    _actions['hideKeystroke'] = function() {
        if (keystroke.style.display !== "none") {
            var outClass = keystroke.classList.contains("expandRichHints") ? "collapseRichHints" : "slideOutRight";
            keystroke.classList.remove("expandRichHints");
            keystroke.classList.add(outClass);
            keystroke.one('animationend', function() {
                setInnerHTML(keystroke, "");
                keystroke.style.display = "none";
                self.flush();
            });
        }
        if (runtime.conf.richHintsForKeystroke > 0 && runtime.conf.richHintsForKeystroke < 10000) {
            clearPendingHint();
        }
    };
    self.hideKeystroke = _actions['hideKeystroke'];
    Visual.mappings.add("y", {
        annotation: "Yank a word(w) or line(l) or sentence(s) or paragraph(p)",
        feature_group: 9
    });
    function showRichHints(keyHints) {
        initL10n(function (locale) {
            var words = keyHints.accumulated;
            var cc = keyHints.candidates;
            words = Object.keys(cc).sort().map(function (w) {
                var meta = cc[w];
                if (meta.annotation) {
                    return `<div><span class=kbd-span><kbd>${htmlEncode(KeyboardUtils.decodeKeystroke(keyHints.accumulated))}<span class=candidates>${w.substr(keyHints.accumulated.length)}</span></kbd></span><span class=annotation>${locale(meta.annotation)}</span></div>`;
                } else {
                    return "";
                }
            }).join("");
            if (words.length > 0 && _pendingHint) {
                setInnerHTML(keystroke, words);
                var cl = keystroke.classList;
                cl.remove("expandRichHints");
                cl.remove("simpleHint");
                cl.add("expandRichHints");
                self.flush();
            }
        });
    }
    _actions['showKeystroke'] = function (message) {
        if (keystroke.style.display !== "none" && keystroke.classList.contains("expandRichHints")) {
            showRichHints(message.keyHints);
        } else {
            clearPendingHint();
            keystroke.style.display = "";
            self.flush();
            var keys = keystroke.innerHTML + htmlEncode(KeyboardUtils.decodeKeystroke(message.keyHints.key));
            setInnerHTML(keystroke, keys);

            var cl = keystroke.classList;
            cl.remove("slideInRight");
            cl.remove("slideOutRight");
            cl.remove("collapseRichHints");
            cl.add("slideInRight");
            cl.add("simpleHint");

            if (runtime.conf.richHintsForKeystroke > 0 && runtime.conf.richHintsForKeystroke < 10000) {
                _pendingHint = setTimeout(function() {
                    showRichHints(message.keyHints);
                }, runtime.conf.richHintsForKeystroke);
            }
        }
    };
    self.showKeystroke = function() {
    };

    _actions['initFrontend'] = function(message) {
        topOrigin = message.origin;
        return new Date().getTime();
    };

    window.addEventListener('message', function(event) {
        var _message = event.data;
        if (_callbacks[_message.id]) {
            var f = _callbacks[_message.id];
            // returns true to make callback stay for coming response.
            if (!f(_message)) {
                delete _callbacks[_message.id];
            }
        } else if (_message.action && _actions.hasOwnProperty(_message.action)) {
            var ret = _actions[_message.action](_message);
            if (_message.ack) {
                top.postMessage({
                    data: ret,
                    action: _message.action + "Ack",
                    responseToContent: _message.commandToFrontend,
                    id: _message.id
                }, topOrigin);
            }
        }
    }, true);

    return self;
})();
