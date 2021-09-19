const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
const id = chrome.runtime.id;
const extensionOrigin = isFirefox ? 'moz-extension://' + id : 'chrome-extension://' + id;

const defaultSettings = {
    general: {
        saveAsDialog: false,
        inputDelay: 1000,
        darkmode: 'auto'
    },
    filename: {
        subfolder: '',
        delimiter: 'of',
        pattern: "$title$ $number$ $delimiter$ $total$ [$author$]"
    },
    scraping: {
        deviantart: {
            buttonDownload: true
        },
        e621: {
            addGeneral: true,
            addSpecies: true,
            addCharacter: true
        },
        twitter: {
            tweetCount: 2
        },
        saucenao: {
            enableRedirect: true
        }
    }
}

const delayThreshold = {
    min: 250,
    max: 4000
};

let currentSettings = JSON.parse(JSON.stringify(defaultSettings));

chrome.storage.sync.get(['squishImageSaver'], result => {
    if (result?.squishImageSaver?.settings !== undefined || result?.squishImageSaver?.settings != null) {
        currentSettings = validateSettings(result.squishImageSaver.settings);
    }
});

const mdc = window.mdc;
let commands;
mdc.autoInit();

window.onload = async () => {
    const tabBar = new mdc.tabBar.MDCTabBar(document.querySelector('.mdc-tab-bar'));
    const contentEls = document.querySelectorAll('.content');

    tabBar.listen('MDCTabBar:activated', function(event) {
        // Hide currently-active content
        document.querySelector('.content--active')?.classList.remove('content--active');
        // Show content for newly-activated tab
        contentEls[event.detail.index]?.classList.add('content--active');

    });

    const textFields =  {
        general: {
            inputDelay: new mdc.textField.MDCTextField(document.getElementById('mdc-scrape-delay')),
        },
        filename: {
            subfolder: new mdc.textField.MDCTextField(document.getElementById('mdc-subfolder-input')),
            pattern: new mdc.textField.MDCTextField(document.getElementById('mdc-filename-pattern')),
            delimiter: new mdc.textField.MDCTextField(document.getElementById('mdc-delimiter')),
        },
        twitter: {
            tweetCount: new mdc.textField.MDCTextField(document.getElementById('mdc-tweet-count')),
        }       
    }

    const checkboxes = {
        general: {
            saveAsDialog: new mdc.checkbox.MDCCheckbox(document.getElementById('mdc-da-save-as-dialog'))
        },
        deviantart: {
            buttonDownload: new mdc.checkbox.MDCCheckbox(document.getElementById('mdc-da-ui-download'))
        },
        e621: {
            addGeneral: new mdc.checkbox.MDCCheckbox(document.getElementById('mdc-e621-general')),
            addSpecies: new mdc.checkbox.MDCCheckbox(document.getElementById('mdc-e621-species')),
            addCharacter: new mdc.checkbox.MDCCheckbox(document.getElementById('mdc-e621-character')),
        },
        saucenao: {
            enableRedirect: new mdc.checkbox.MDCCheckbox(document.getElementById('mdc-enable-sauce'))
        }
    }

    const select = {
        general: {
            darkmode: new mdc.select.MDCSelect(document.getElementById('mdc-darkmode-select')),
        }
    }

    const content = document.getElementById('setting-contents');
    
    chrome.commands.getAll((cmd) => {
        commands = cmd;
        generateKbd(commands);
    });

    setSettings(currentSettings);

    function setSettings(settings) {
        textFields.general.inputDelay.value = settings.general.inputDelay;
        textFields.filename.delimiter.value = settings.filename.delimiter;
        textFields.filename.pattern.value = settings.filename.pattern;
        textFields.filename.subfolder.value = settings.filename.subfolder;
        textFields.twitter.tweetCount.value = settings.scraping.twitter.tweetCount;

        checkboxes.general.saveAsDialog.checked = settings.general.saveAsDialog;
        checkboxes.deviantart.buttonDownload.checked = settings.scraping.deviantart.buttonDownload;
        checkboxes.e621.addGeneral.checked = settings.scraping.e621.addGeneral;
        checkboxes.e621.addSpecies.checked = settings.scraping.e621.addSpecies;
        checkboxes.e621.addCharacter.checked = settings.scraping.e621.addCharacter;
        checkboxes.saucenao.enableRedirect.checked = settings.scraping.saucenao.enableRedirect;

        select.general.darkmode.value = settings.general.darkmode;

        switchDarkModes(content, settings.general.darkmode);
    }

    [].forEach.call(
        document.querySelectorAll('.mdc-text-field__icon--trailing.refresh-icon'),
        el => {
            el.addEventListener('click', onClickReset);
        }
    );
    function onClickReset(event) {
        switch(event.target.id) {
            case 'reset-delay':                
                textFields.general.inputDelay.value = defaultSettings.general.inputDelay;
                currentSettings.general.inputDelay = defaultSettings.general.inputDelay;
                break;
            case 'reset-subfolder':
                textFields.filename.subfolder.value = defaultSettings.filename.subfolder;
                currentSettings.filename.subfolder = defaultSettings.filename.subfolder;
                break;
            case 'reset-filename-pattern':
                textFields.filename.pattern.value = defaultSettings.filename.pattern;
                currentSettings.filename.pattern = defaultSettings.filename.pattern;
                break;
            case 'reset-delimiter':
                textFields.filename.delimiter.value = defaultSettings.filename.delimiter;
                currentSettings.filename.delimiter = defaultSettings.filename.delimiter;
            case 'reset-tweet-count':
                textFields.twitter.tweetCount.value = defaultSettings.scraping.twitter.tweetCount;
                currentSettings.scraping.twitter.tweetCount = defaultSettings.scraping.twitter.tweetCount;
                break;
        }
        sendSettingsToStorage(currentSettings);
    }

    [].forEach.call(
        document.querySelectorAll('.mdc-text-field__input, .mdc-checkbox__native-control'),
        el => {
            el.addEventListener('change', onSettingUpdate);
        }
    );
    function onSettingUpdate(event) {
        let isValid = false;
        switch(event.target.id) {
            case 'save-as-dialog':
                isValid = true;
                currentSettings.general.saveAsDialog = checkboxes.general.saveAsDialog.checked;
                break;
            case 'scrape-delay':
                isValid = textFields.general.inputDelay.valid;
                currentSettings.general.inputDelay = textFields.general.inputDelay.value;
                break;
            case 'subfolder-input':
                isValid = textFields.filename.subfolder.valid;
                currentSettings.filename.subfolder = textFields.filename.subfolder.value;
                break;
            case 'filename-pattern':
                isValid = textFields.filename.pattern.valid;
                currentSettings.filename.pattern = textFields.filename.pattern.value;
                break;
            case 'delimiter-input':
                isValid = textFields.filename.delimiter.valid;
                currentSettings.filename.delimiter = textFields.filename.delimiter.value;
                break;
            case 'da-ui-download':
                isValid = true;
                currentSettings.scraping.deviantart.buttonDownload = checkboxes.deviantart.buttonDownload.checked;
                break;
            case 'e621-general-labels':
                isValid = e621AtLeastOneChecked(Object.values(checkboxes.e621), checkboxes.e621.addGeneral);
                currentSettings.scraping.e621.addGeneral = checkboxes.e621.addGeneral.checked;
                break;
            case 'e621-species-labels':
                isValid = e621AtLeastOneChecked(Object.values(checkboxes.e621), checkboxes.e621.addSpecies);
                currentSettings.scraping.e621.addSpecies = checkboxes.e621.addSpecies.checked;
                break;
            case 'e621-character-labels':
                isValid = e621AtLeastOneChecked(Object.values(checkboxes.e621), checkboxes.e621.addCharacter);
                currentSettings.scraping.e621.addCharacter = checkboxes.e621.addCharacter.checked;
                break;
            case 'enable-sauce':
                isValid = true;
                currentSettings.scraping.saucenao.enableRedirect = checkboxes.saucenao.enableRedirect.checked;
                break;
            default:
                break;
        }
        if (isValid) {
            sendSettingsToStorage(currentSettings);
        }   
    }

    select.general.darkmode.listen('MDCSelect:change', (e) => {
        currentSettings.general.darkmode = select.general.darkmode.value;
        switchDarkModes(content, currentSettings.general.darkmode);
        sendSettingsToStorage(currentSettings);
    });
}

function switchDarkModes(contentNode, behavior) {
    switch(behavior.toLowerCase()) {
        case 'off':
            contentNode?.classList.remove('dark-auto');
            contentNode?.classList.remove('dark-mode');
            break;
        case 'auto':
            contentNode?.classList.add('dark-auto');
            contentNode?.classList.remove('dark-mode');
            break;
        case 'on':
            contentNode?.classList.remove('dark-auto');
            contentNode?.classList.add('dark-mode');
            break;
        default:
            return false;
    }
    return true;
}

function sendSettingsToStorage(settings) {
    settings = validateSettings(settings);
    chrome.storage.sync.set({squishImageSaver: {settings: settings}});
    chrome.runtime.sendMessage(id, {squishImageSaver: {settings: settings}});
}

function e621AtLeastOneChecked(mdcCheckboxes, mdcTargetCheckbox) {
    if (!mdcTargetCheckbox.checked) {
        for (let i = 0; i < mdcCheckboxes.length; i++) {
            if (mdcCheckboxes[i] !== mdcTargetCheckbox && mdcCheckboxes[i].checked) {
                return true;
            }
        }
        mdcTargetCheckbox.checked = true;
        return false;
    }
    return true;
}

function validateSettings(settings) {
    if (settings.general) {
        let saveAs = toBool(settings.general.saveAsDialog);
        if (saveAs == null) {
            settings.general.saveAsDialog = defaultSettings.general.saveAsDialog;
        } else {
            settings.general.saveAsDialog = saveAs;
        } 

        let inputDelay = Number.parseInt(settings.general.inputDelay);
        if (inputDelay === NaN) {
            settings.general.inputDelay = defaultSettings.general.inputDelay;
        }
        settings.general.inputDelay = Math.max(delayThreshold.min, Math.min(delayThreshold.max, inputDelay));

        let darkmode = settings.general.darkmode;
        if (darkmode === undefined || darkmode == null || darkmode.toString().match(/^off$|^auto$|^on$/i).length !== 1) {
            settings.general.darkmode = defaultSettings.general.darkmode;
        }
    } else {
        settings.general = JSON.parse(JSON.stringify(defaultSettings.general));
    }

    if (settings.filename) {
        let subfolder = settings.filename.subfolder;
        if (subfolder === undefined || subfolder == null || subfolder === '' || subfolder.toString().match(/^[^\/\\?%*:"><;~.]+(\/[^\/\\?%*:"><;~.]+)*\/$/i).length !== 2) {
            settings.filename.subfolder = defaultSettings.filename.subfolder;
        }

        let delimiter = settings.filename.delimiter;
        if (delimiter === undefined || delimiter == null || delimiter.toString().match(/[^\\?%*\"<>~]*/i).length !== 1) {
            settings.filename.delimiter = defaultSettings.filename.delimiter;
        }

        let pattern = settings.filename.pattern;
        if (pattern === undefined || pattern == null || pattern.toString().match(/(([^\\?%*:$\"<>~])*(\$title\$)?|(\$number\$)?|(\$delimiter\$)?|(\$total\$)?|(\$author\$)?\2*)+/i).length !== 1) {
            settings.filename.delimiter = defaultSettings.filename.delimiter;
        }
    } else {
        settings.filename = JSON.parse(JSON.stringify(defaultSettings.filename));
    }

    if (settings.scraping) {
        let buttonDownload = toBool(settings.scraping.deviantart.buttonDownload);
        if (buttonDownload == null) {
            settings.scraping.deviantart.buttonDownload = defaultSettings.scraping.deviantart.buttonDownload;
        } else {
            settings.scraping.deviantart.buttonDownload = buttonDownload;
        }

        let addGeneral = toBool(settings.scraping.e621.addGeneral);
        if (addGeneral == null) {
            settings.scraping.e621.addGeneral = defaultSettings.scraping.e621.addGeneral;
        } else {
            settings.scraping.e621.addGeneral = addGeneral;
        }
        let addSpecies = toBool(settings.scraping.e621.addSpecies);
        if (addSpecies == null) {
            settings.scraping.e621.addSpecies = defaultSettings.scraping.e621.addSpecies;
        } else {
            settings.scraping.e621.addSpecies = addSpecies;
        }
        let addCharacter = toBool(settings.scraping.e621.addCharacter);
        if (addCharacter == null) {
            settings.scraping.e621.addCharacter = defaultSettings.scraping.e621.addCharacter;
        } else {
            settings.scraping.e621.addCharacter = addCharacter;
        }

        let enableRedirect = toBool(settings.scraping.saucenao.enableRedirect);
        if (enableRedirect == null) {
            settings.scraping.saucenao.enableRedirect = defaultSettings.scraping.saucenao.enableRedirect;
        } else {
            settings.scraping.saucenao.enableRedirect = enableRedirect;
        }

        let tweetCount = Number.parseInt(settings.scraping.twitter.tweetCount);
        if (tweetCount === NaN) {
            settings.scraping.twitter.tweetCount = defaultSettings.scraping.twitter.tweetCount;
        }
        settings.scraping.twitter.tweetCount = Math.max(1, tweetCount);
    } else {
        settings.scraping = JSON.parse(JSON.stringify(defaultSettings.scraping));
    }
    return settings;
}

function toBool(str) {
    if (str === undefined || str == null) {
        return null;
    }
    switch(str.toString().toLowerCase()) {
        case 'true':
            return true;
        case 'false':
            return false;
        default:
            return null;
    }
}
function generateKbd(commands) {
    if (commands) {
        for (let i=0; i < commands.length; i++) {
            if (commands[i].shortcut !== '') {
                let keys = commands[i].shortcut.match(/\w+/g);
                keys = keys.map(key => wrapElement("kbd", key));
                keys = keys.join(' + ');
                
                let targetEl = document.getElementById(commands[i].name);
                if (targetEl?.innerHTML !== undefined) {
                    targetEl.innerHTML = keys;
                }
            }
        }
    }
}
function wrapElement(el, text) {
    let toReplace = {
        $el: el,
        $text: text
    }
    return ("<$el>$text</$el>").replace(/\$el|\$text/gi, matched => toReplace[matched]);
}
