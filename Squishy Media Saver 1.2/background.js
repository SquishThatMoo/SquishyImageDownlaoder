var squishImageSaver = squishImageSaver || {};

squishImageSaver = (() => {
    const id = chrome.runtime.id;
    const extensionOrigin = 'chrome-extension://' + id;
    const contentFolder = '/content/';

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
    };
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

    let startSleep = 0;
    let downloadSubFolder = '';
    
    let received = 0;
    let downloaded = 0;

    let openEditor = false;
    let waitForSauce = '';

    chrome.commands.onCommand.addListener((command) => {
        let tempDate = Date.now();
        if ((command === 'run-image-saver' || command === 'run-image-saver-with-editor') && (tempDate > (startSleep+currentSettings.general.inputDelay))) {
            startSleep = Date.now();
            getCurrentTab().then(function(tab) {  
                if (tab !== undefined || tab != null) {
                    let matchedDomain = false;
                    let domain = '';
                    let url = '';
                    try {
                        url = new URL(tab.url);
                        domain = url.hostname;                  
                    } catch (e) {
                        console.log('Illegal url.', e)
                    }
                    
                    switch (domain) {
                        case "www.deviantart.com":
                        case "twitter.com":
                        case "www.furaffinity.net":
                        case "e621.net":
                        case "www.hentai-foundry.com":
                            matchedDomain = true;
                            chrome.tabs.sendMessage(tab.id, {squishImageSaver: {scrape: domain, settings: currentSettings}});
                            break;
                        default:
                            if (url.pathname !== '' && currentSettings.scraping.saucenao.enableRedirect) {
                                let fileType = getFileType(url);
                                switch (fileType) {
                                    case 'jpg':
                                    case 'jpeg':
                                    case 'jfif':
                                    case 'jpe':
                                    case 'png':
                                    case 'apng':
                                    case 'gif':
                                    case 'webp':
                                        chrome.tabs.create({url: "https://saucenao.com/", active: true});
                                        waitForSauce = tab.url;
                                        break;
                                }
                            }
                            break;
                    }
                    if (matchedDomain && command === 'run-image-saver-with-editor') {
                        openEditor = true;
                    } else {
                        openEditor = false;
                    }
                    console.log("Called in: ", domain, " @tab#", tab.id);
                }    
            });
        } 
        return true;

    });


    async function getCurrentTab() {
        let queryOptions = { active: true, currentWindow: true };
        let [tab] = await asyncTabsQuery(queryOptions);
        return tab;
    }
    function asyncTabsQuery(queryOptions) {
        return new Promise(resolve => chrome.tabs.query(queryOptions, resolve));
    }

    chrome.runtime.onMessage.addListener(
        function(request, sender, sendResponse) {
            let response = '';

            if (request?.squishImageSaver.getSettings) {
                sendResponse(currentSettings);
            }

            if (sender.id === id && sender.url === (extensionOrigin + contentFolder + "popup.html")) {
                if (request?.squishImageSaver.settings) {
                    currentSettings = validateSettings(request.squishImageSaver.settings);
                    chrome.storage.sync.set({squishImageSaver: {settings: request.squishImageSaver.settings}});
                }    
            }
            if (sender.tab && request?.squishImageSaver) {       
                received++;
                let squishImageSaver = request.squishImageSaver;
                console.log(squishImageSaver);
                if (squishImageSaver?.mediaData) {
                    let mediaItem = validateMediaData(squishImageSaver.mediaData);
                    console.log(!(squishImageSaver.mediaData?.notSupported === true),!squishImageSaver.mediaData?.notSupported );
                    response += `Received media data #${received}.`;

                    if (!(squishImageSaver.mediaData?.notSupported === true) && (!openEditor || squishImageSaver?.finalDownload)) {
                        if (squishImageSaver?.downloadInExtension) {
                            downloadMedia(mediaItem);
                            downloaded++;
                        }
                    } else {
                        getCurrentTab().then(tab => {
                            if (tab !== undefined || tab != null) {
                                chrome.tabs.sendMessage(tab.id, {squishImageSaver: {mediaData: mediaItem, downloadInExtension: squishImageSaver?.downloadInExtension}}, function(response) {
                                console.log(response);
                                });
                            }
                        });
                    }
                    
                    response += ` Downloaded ${downloaded}.`;
                }
                if (squishImageSaver?.pageReady && waitForSauce !== '') {
                    getCurrentTab().then(tab => {   
                        if (tab !== undefined || tab != null) {
                            chrome.tabs.sendMessage(tab.id, {squishImageSaver: {scrape: 'saucenao', href: waitForSauce}}, function(response) {
                                waitForSauce = '';
                                console.log(response);
                            });
                        }
                    });
                    response += "Status Received.";      
                }
                if (squishImageSaver?.settings) {
                    currentSettings = squishImageSaver.settings;
                    console.log(currentSettings);
                }
            }
            
            sendResponse(response);
            return true;
        }     
    );

/*
    chrome.downloads.onCreated.addListener((downloadItem) => {
        console.log('Caught creation of download.', downloadItem.id);
    })
*/

    function downloadMedia (mediaItem) {
        if (mediaDataNotEmpty(mediaItem)) {
            chrome.downloads.download({
                conflictAction: 'uniquify',
                filename:  downloadSubFolder + createFileName(mediaItem),
                url: mediaItem.href,
                saveAs: currentSettings.general.saveAsDialog
            }, async function(e) {
                console.log("Downloading " + e + "@" + new Date());
            }) 
        }
    }

    function validateMediaData(mediaItem) {
        mediaItem.author = removeUndefined(removeIllegalCharacters(mediaItem?.author));
        mediaItem.title = removeUndefined(removeIllegalCharacters(mediaItem?.title));
        try {
            mediaItem.href = (new URL(mediaItem?.href)).href;
        } catch (e) {
            console.log("Illegal url.");
            mediaItem.href = '';
        }

        mediaItem.fileType = mediaItem?.fileType !== undefined ? validateFilename(mediaItem?.fileType) : getFileType(mediaItem.href);
        mediaItem.number = removeNonNumberCharacters(mediaItem?.number);
        mediaItem.total = removeNonNumberCharacters(mediaItem?.total);

        return mediaItem;
    }

    function validateFilename(str) {
        str = removeIllegalCharacters(str);
        return str.replace(/\W/gi, '').trim().slice(0,4).trim();
    }
    function removeUndefined(str) {
        return str === 'undefined' ? '' : str;
    }
    function removeNonNumberCharacters(str) {
        str = removeIllegalCharacters(str);
        return str.replace(/\D/gi, '').trim();
    }
    function removeIllegalCharacters(str) {
        if (str !== undefined || str != null) {
            str = str.toString();
            return str.replace(/[/\\?%*:|"<>~]/g, '').replace(/\r?\n|\r|\t|\s+/g, ' ').trim();
        }
        return '';
    }
    function mediaDataNotEmpty (mediaItem) {
        return mediaItem?.author != '' && mediaItem?.title != '' && mediaItem?.href;
    }

    function createFileName (mediaItem) {
        let replacementText = {
            $author$: mediaItem.author,
            $title$: mediaItem.title,
            $number$: mediaItem.number,
            $total$: mediaItem.total,
            $delimiter$: currentSettings.filename.delimiter
        };
        if (mediaItem?.addNumber === false) {
            replacementText.$number$ = '';
            replacementText.$total$ = '';
            replacementText.$delimiter$ = '';
        }
        if (mediaItem.total === '') {
            replacementText.$delimiter$ = '';
        }
        let fileNameString = currentSettings.filename.pattern;       
        let subfolder = currentSettings.filename.subfolder;
        let pattern = /\$title\$|\$number\$|\$delimiter\$|\$total\$|\$author\$/gi;

        fileNameString = fileNameString.replace(pattern, matched => replacementText[matched]);

        if (mediaItem?.fileType) {
            fileNameString += "." + mediaItem.fileType;
        }
        return subfolder.replace(/^\//g, '').replace(/\r?\n|\r|\t|\s+/g, ' ').trim() + fileNameString.replace(/[/\\?%*:"<>~]/g, '').replace(/\r?\n|\r|\t|\s+/g, ' ').trim();
    }

    function getFileType (href) {
        try {
            if (href !== undefined || href !== '') {
                let parsed = new URL(href);
                return parsed.pathname.match(/\.([\w]){1,}$/gi)[0].replace('.', '').trim();
            }
        } catch (e) {
            console.log(e);
        }
        return '';
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

    function validateSettings(settings) {
        if (settings.general !== undefined || settings.general != null) {
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
}) ();
