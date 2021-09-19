"use strict";
(async () => {
    const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
    const id = chrome.runtime.id;

    //const mdc = window.mdc;

    let settings = {
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
  
    let isDown = false;
    let offset = [];
    let mediaData = [];
    let mediaItem = {};
    let waitingForUser = false;
    let userTotal = '';
    let userNumeration = '';
    let downloadInExtension = true; 

    let article = document.createElement("article");
    article.id = 'interface-query';
    article.classList = ["mdc-typography--body2 interface-card.mdc-card hidden"];
    

    let contentHTML = await fetch(chrome.runtime.getURL('/content/interface.html'));
    contentHTML = await contentHTML.text();
    contentHTML = new DOMParser().parseFromString(contentHTML, "text/html").getElementById("interface");
    article.appendChild(contentHTML);
    document.body.appendChild(article);

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (sender.id === id && request?.squishImageSaver) {
            if (request.squishImageSaver?.mediaData) {

                mediaData.push(request?.squishImageSaver?.mediaData);
                
                loadNextMediaItem();
                article.classList.remove('hidden');
                sendResponse('Recevied image data.');
            }

            if (request.squishImageSaver.downloadInExtension !== undefined) {
                downloadInExtension = request.squishImageSaver.downloadInExtension;
            }

            if (request.squishImageSaver?.scrape) {
                if (request.squishImageSaver.settings) {
                    settings = request.squishImageSaver.settings;
                }
                switchDarkModes(article, settings.general.darkmode);
                let response = ''
                switch(window.location.hostname) {
                    case "twitter.com":
                        scrapeTwitter();
                        response = 'Scraping twitter.';
                        break;
                    case "www.deviantart.com":
                        scrapeDeviantArt();
                        response = 'Scraping deviantArt.';
                        break;
                    case "www.furaffinity.net":
                        scrapeFurAffinity();
                        response = 'Scraping FurAffinity.';
                        break;
                    case "e621.net":
                        scrapee621();
                        response = 'Scraping e621.';
                        break;
                    case "www.hentai-foundry.com":
                        scrapeHentaiFoundry();
                        response = 'Scraping Hentai Foundry.';
                        break;
                    case "saucenao.com/":
                        scrapeSauceNao(request.squishImageSaver?.href);
                        response = 'Inserting search url in sauce nao.';
                        break;
                    default:
                        break;
                }
                sendResponse(response);
            }
        } else {
            sendResponse('No data.');
        }
        return true;
    })
    function loadNextMediaItem() {
        if (mediaData.length === 0) {
            cancelButton.click();
        } else if (!waitingForUser) {
            mediaItem = mediaData.shift();
            setValues(mediaItem);
            waitingForUser = true;
        } 
    }

    /**Handle window movement - limit to headline or usability is shit */
    let headline = document.getElementById('sq-interface-title');
    headline.addEventListener('mousedown', e => {
        isDown = true;
        offset = [
            article.offsetLeft - e.clientX,
            article.offsetTop - e.clientY
        ];
        
    }, true);

    document.addEventListener('mouseup', () =>  {
        isDown = false;
    }, true);

    document.addEventListener('mousemove', event => {
        if (isDown) {
            let mousePosition = {
                x : event.clientX,
                y : event.clientY
            };
            article.style.left = (mousePosition.x + offset[0]) + 'px';
            article.style.top  = (mousePosition.y + offset[1]) + 'px';
        }
    }, true);

    /** Setup nodes */
    let buttons = document.querySelectorAll('.mdc-button, .mdc-icon-button');
    let formFields = {
        title: new mdc.textField.MDCTextField(document.getElementById('mdc-filename-title')),
        author: new mdc.textField.MDCTextField(document.getElementById('mdc-filename-author')),
        enableNumeration: new mdc.checkbox.MDCCheckbox(document.getElementById('mdc-enable-numeration')),
        number: new mdc.textField.MDCTextField(document.getElementById('mdc-filename-gallery-number')),
        total: new mdc.textField.MDCTextField(document.getElementById('mdc-filename-total-number')),
    }
    for (let i = 0; i < buttons?.length; i++) {
        new mdc.ripple.MDCRipple(buttons[i]);
    }
    let numerationNode = document.getElementById('enableNumeration');
    let fileNumberNode = document.getElementById('sq-filename-gallery-number');
    let fileTotalNode = document.getElementById('sq-filename-total-number');
    let titleNode = document.getElementById('sq-filename-title');
    let authorNode = document.getElementById('sq-filename-author');
    let resultNode = document.getElementById('sq-filename-result');

    let cancelButton = document.getElementById('sq-filename-cancel');
    let continueButton = document.getElementById('sq-filename-continue');
    updateFileName();

    /**Handle buttons */
    cancelButton.addEventListener('click', (e) => {
        reset();
        article.classList.add('hidden');
    });

    continueButton.addEventListener('click', (e) => {
        if (mediaItem !== undefined && mediaItem != null && Object.keys(mediaItem).length !== 0 && !(mediaItem?.notSupported === true)) {
            mediaItem = gatherValues();
            sendToBackend({mediaData: mediaItem, downloadInExtension: downloadInExtension, finalDownload: true});

            waitingForUser = false;
            continueButton.blur();
            loadNextMediaItem();

        } else if (mediaItem?.notSupported) {
            cancelButton.click();
        }
    });

    document.getElementById('sq-copy-filename').addEventListener('click', (e) => {
        navigator.clipboard.writeText(resultNode.textContent);
        document.getElementById('sq-copy-filename').blur();
        return true;
    });
    document.addEventListener('keydown', (e) => {
        if (!article.classList.contains('hidden')) {
            switch (e.key) {
                case 'Escape':
                    cancelButton.click();
                    break;
                case 'Enter':
                    continueButton.click();
                    break;
                default:
                    break;   
            }
        }

        return true;
    });
    /**Handle input resets */
    document.getElementById('sq-refresh-author').addEventListener('click', (e) => {
        if (mediaItem.author !== undefined) {
            formFields.author.value = mediaItem.author;
        } else {
            formFields.author.value = '';
        }
        updateFileName();
        return true;
    });
    document.getElementById('sq-refresh-title').addEventListener('click', (e) => {
        if (mediaItem.title !== undefined) {
            formFields.title.value = mediaItem.title;
        } else {
            formFields.title.value = '';
        }
        updateFileName();
        return true;
    });


    /**Handle file name update */
    numerationNode.addEventListener('change', toggleNumeration);
    titleNode.addEventListener('keyup', (e) => {
        updateFileName();
    });
    fileTotalNode.addEventListener('keyup', (e) => {
        userTotal = formFields.total.value;
        updateFileName();
    });

    fileNumberNode.addEventListener('keyup', (e) => {
        updateFileName();
    });
    authorNode.addEventListener('keyup', (e) => {
        updateFileName();
    });

    function reset() {
        waitingForUser = false;
        setValues({
            author: '',
            title: '',
            number: '',
            total: ''
        });
        userTotal = '';
        userNumeration = '';
        mediaData = [];
    }

    function gatherValues() {
        let newMediaItem = mediaItem !== undefined ? JSON.parse(JSON.stringify(mediaItem)) : {};
        newMediaItem.author = formFields.author.value;
        newMediaItem.title = formFields.title.value;
        newMediaItem.number = formFields.number.value;
        newMediaItem.total= formFields.total.value;
        newMediaItem.addNumber = formFields.enableNumeration.checked;

        if (!numerationNode.checked) {
            newMediaItem.number = '';
            newMediaItem.total = '';
        }
        return newMediaItem;
    }
    function mapMediaItemForOutput(mediaItem) {
        return {
            $author$: mediaItem.author,
            $title$: mediaItem.title,
            $number$: mediaItem.number,
            $total$: mediaItem.total,
            $delimiter$: (numerationNode.checked && mediaItem.total !== '') ? settings.filename.delimiter : ''
        };
    }
    function updateFileName () {
        let replacementText = mapMediaItemForOutput(gatherValues());
        let fileNameString = settings.filename.pattern;;       
        let pattern = /\$title\$|\$number\$|\$delimiter\$|\$total\$|\$author\$/gi;

        fileNameString = fileNameString.replace(pattern, matched => replacementText[matched]);

        if (mediaItem?.fileType) {
            fileNameString += "." + mediaItem.fileType;
        }

        resultNode.textContent = fileNameString.replace(/[/\\?%*:"<>~]/g, '').replace(/\r?\n|\r|\t|\s+/g, ' ').trim();
    }

    function toggleNumeration() {  
        if (formFields.enableNumeration.checked) {
            formFields.number.disabled = false;
            formFields.total.disabled = false;
        } else {
            formFields.number.disabled = true;
            formFields.total.disabled = true;    
        }
        updateFileName();
        return true;
    }

    function setValues(mediaItem) {
        if (mediaItem !== undefined && mediaItem != null) {
            if (mediaItem?.fileType === '' && mediaItem?.href) {
                mediaItem.fileType = getFileType(mediaItem.href);
            }
            formFields.title.value = mediaItem?.title;
            formFields.author.value = mediaItem?.author;
            if (mediaItem?.number !== '') {
                formFields.number.value = mediaItem.number;
            } else {
                formFields.number.value = '';
            }
            if (mediaItem?.total !== '' && userTotal === '') {
                formFields.total.value = mediaItem.total;
            } else if (userTotal !== '') {
                formFields.total.value = userTotal;
            }

            if (userNumeration === '') {
                if (mediaItem?.number || mediaItem?.total) {
                    formFields.enableNumeration.checked = true;
                } else {
                    formFields.enableNumeration.checked = false;
                }
            } else {
                if (userNumeration) {
                    formFields.enableNumeration.checked = true;
                } else {
                    formFields.enableNumeration.checked = false;
                }
            }
            
            toggleNumeration();
            updateFileName();
        }
        //createFormState({button: true, checkbox: true, textField: true});
    }

    /**Helper functions */
    function getFileType (href) {
        if (href !== undefined || href !== '') {
            let parsed = new URL(href);
            return parsed.pathname.match(/\.([\w]){1,}$/gi)[0].replace('.', '').trim();
        }
        return '';
    }
    function timeout(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    function getRandomArbitrary(min, max) {
        return Math.random() * (max - min) + min;
    }
    function sendToBackend(payload) {
        chrome.runtime.sendMessage(id, {squishImageSaver: payload});
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
    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
    }
    /*
    Scrape section
    */
    async function scrapeTwitter() {
        let maxReplies = settings.scraping.twitter.tweetCount || 2;
        //automatically close gallery viewer - html is pruned
        let imageViewer = document.querySelectorAll('[role="presentation"] [aria-label][tabindex="0"][role="button"]');
        if (imageViewer.length !== 0) {
            document.addEventListener('DOMNodeInserted', wait, {once: true});
            imageViewer[0].click()
        } else {
            process();
        }
        //wait until page is fully changed
        async function wait () {
            await setTimeout(process, 250);
        }
        
        
        async function process () {
            let authors = document.querySelectorAll('[aria-label^="Timeline:"] [data-testid="tweet"] a[role="link"] div[dir="ltr"] > span');
            for (let j = 0; j < (authors.length < maxReplies ? authors.length : maxReplies); j++) {
                let authorMain = authors[j].closest('article');
                let tweetId = authorMain.querySelector('[href*="/status/"][role="link"]')?.href,
                    token = getCookie('ct0'), useApi = true,
                    guestToken = getCookie('gt');

                if (tweetId !== undefined) {
                    tweetId = new URL(tweetId).pathname.match(/\/status\/(\d+)/g)[0].match(/\d+$/g);
                }

                if (tweetId !== undefined && token !== undefined && token != null) {
                    try {
                        let headers = new Headers({'authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA', 'x-csrf-token':token});
                        if (guestToken) {
                            headers.append('x-guest-token', guestToken);
                        }

                        let tweetContent = await fetch(`https://twitter.com/i/api/1.1/statuses/show/${tweetId}.json?tweet_mode=extended`, {
                            method: 'GET', 
                            headers: headers});
                        tweetContent = await tweetContent.json();
                        
                        let titleNode = authorMain.querySelectorAll('div[dir="auto"][lang="en"] > span');
                        let title = titleNode[0]?.textContent;

                        let result = {
                            author: tweetContent.user.screen_name,
                            title: title
                        }

                        let extendedMedia = tweetContent?.extended_entities?.media;
                        if (extendedMedia === undefined) {
                            return false;
                        }
                        for (let i = 0; i < extendedMedia.length; i++) {
                            if (extendedMedia[i].video_info) {
                                let maxUrl = extendedMedia[i].video_info?.variants.reduce((prev, current) => {
                                    return (prev.bitrate > current.bitrate) ? prev : current
                                });
                                result.href = maxUrl.url;
                            } else {
                                let url = new URL(extendedMedia[i].media_url_https);
                                url.searchParams.set('name', 'orig');

                                result.href = url.href;
                                if (extendedMedia.length > 1) {
                                    result.number = i+1;
                                    result.total = extendedMedia.length;
                                    result.addNumber = true;
                                }         
                            }
                            sendToBackend({mediaData: result, downloadInExtension: true});
                            await timeout(50);
                        }

                    } catch (e) {
                        console.log(e);
                        useApi = false;
                    }   
                } else {
                    useApi = false;
                }

                //Fallback in case API is failing
                if (!useApi) {            
                    let titleNode = authorMain.querySelectorAll('div[dir="auto"][lang="en"] > span');
                    titleNode = titleNode.length != 0 ? titleNode : authorMain.querySelectorAll('div[dir="auto"][lang] > span:only-of-type');
                    let imageNode = authorMain.querySelectorAll('[data-testid="tweetPhoto"] img');
                    
                    let title = titleNode[0]?.textContent;

                    let result = {
                        author: authors[j].textContent.replace(/[\@]/g, ''),
                        title: title
                    };   

                    let videoNode = authorMain.querySelectorAll('[data-testid="videoPlayer"] video[aria-label]');
                    
                    //creates filename for video elements - should be user controlled later
                    if (videoNode.length !== 0) {
                        if (document.getElementById('squish-filename') == null) {
                            let src = videoNode[0].src;

                            if (new URL(src).protocol !== 'blob:') {
                                result.href = src;
                                result.fileType = getFileType(src);
                                result.addNumber = false;
                                sendToBackend({mediaData: result, downloadInExtension: true});
                            } else {
                                result.notSupported = true;
                                sendToBackend({mediaData: result, downloadInExtension: true});
                            }                      
                        }
                    }

                    for (let i = 0; i < imageNode.length; i++) {
                        //todo - handle galleries
                        let url = new URL(imageNode[i].src);
                        url.searchParams.set('name', 'orig');
                        let fileType = url.searchParams.get('format');
                        
                        result.href = url.href;
                        result.fileType = fileType;
                        if (imageNode.length > 1) {
                            result.number = i+1;
                            result.total = imageNode.length;
                            result.addNumber = true;
                        }
                        sendToBackend({mediaData: result, downloadInExtension: true});
                        await timeout(50);
                    }
                }
                
            }

                
            
        }

    }
    
    async function scrapeDeviantArt() {
        let artStage = document.querySelectorAll('[data-hook="art_stage"]')        
        //only do stuff if it is an art page
        if (artStage.length !== 0) {
            let deviationID = parseInt(document.querySelector('[data-itemid]')?.getAttribute('data-itemid'));
            let deviationURL = new URL('https://www.deviantart.com/_napi/da-user-profile/shared_api/deviation/extended_fetch');
            let result = {}

            if (deviationID !== NaN) {
                let params = {type: 'art', deviationid: deviationID};
                Object.keys(params).forEach(key => deviationURL.searchParams.append(key, params[key]));

                let galleryContent = await fetch(deviationURL, {method: 'GET'});
                galleryContent = await galleryContent.json();

                result = {
                    author: galleryContent?.deviation?.author?.username,
                    title: galleryContent?.deviation?.title,
                    href: createFullURL(galleryContent?.deviation?.media)
                } 

                if (settings.scraping.deviantart.buttonDownload && galleryContent?.deviation.isDownloadable) {
                    let downloadNode = document.querySelector('a[data-hook="download_button"], button[data-hook="download_button"]');
                    result.href = downloadNode.href || galleryContent?.extended?.download?.url || result.href;
                }
               
            } else {
                let authorNode = document.querySelector('div [data-hook="deviation_meta"] a');
                let titleNode = document.querySelector('h1[data-hook="deviation_title"]');
                let imageNode = document.querySelector('[data-hook="art_stage"] img');
                let videoNode = document.querySelector('video');
                
                result = {
                    author: authorNode.getAttribute('title'),
                    title: titleNode.textContent,
                    href: imageNode?.src || videoNode?.src
                };   
            } 
            sendToBackend({mediaData: result, downloadInExtension: true});                          
        }

        function createFullURL(media) {
            if (media !== undefined || media.length > 0)  {
                let url = new URL(media.baseUri);
                let subpathObject = media.types.filter(type => type.t === 'fullview');
                if (subpathObject.c) {
                    let subpath = subpathObject.c.replace('<prettyName>', media.prettyName);
                    url.pathname += subpath;
                }
                url.searchParams.append('token', media.token[0])
                return url.href;
            }
        }
    }

    async function scrapeFurAffinity() {
        let artStage = document.querySelectorAll('.submission-content')
    
        //only do stuff if it is an art page
        if (artStage.length !== 0) {
            let authorNode = document.querySelector('.submission-title + a');
            let titleNode = document.querySelector('.submission-title>h2>p');
            let imageNode = document.querySelector('#submissionImg');
    
            let result = {
                author: authorNode.textContent,
                title: titleNode.textContent,
                href: new URL('https:' + imageNode.getAttribute('data-fullview-src'))
            };        
            
            sendToBackend({mediaData: result, downloadInExtension: true});  
        }
    }

    async function scrapee621() {
        let artStage = document.querySelectorAll('#image-container')
    
        //only do stuff if it is an art page
        if (artStage.length !== 0) {
            let authorNodes = document.querySelectorAll('[itemprop="author"]');              
            let propGeneralNodes = document.querySelectorAll('.general-tag-list a.search-tag');
            let propSpeciesNodes = document.querySelectorAll('.species-tag-list a.search-tag');
            let propCharacterNodes = document.querySelectorAll('.character-tag-list a.search-tag');
            let imageNode = document.querySelector('#image-resize-link');
    
            let title = '';
            if (settings.scraping.e621.addCharacter) {
                title = customStringConcat(propCharacterNodes, ' ');
            }

            if (settings.scraping.e621.addSpecies) {
                title += title === '' ? '' : " | ";
                title += customStringConcat(propSpeciesNodes, ' ');
            }

            if (settings.scraping.e621.addGeneral) {
                title += title === '' ? '' : " | ";
                title += customStringConcat(propGeneralNodes, ' ');
            }

            let result = {
                author: customStringConcat(authorNodes, ' '),
                title: title,
                href: imageNode.href
            };        
    
            sendToBackend({mediaData: result, downloadInExtension: true});  
        }
        function customStringConcat(nodeArray, del) {
            let result = '';
            for (let i = 0; i < nodeArray.length; i++) {
                result += nodeArray[i]?.textContent + del;
            }
            return result.trim();
        }
    }

    async function scrapeHentaiFoundry() {
        let artStage = document.querySelectorAll('#picBox');
    
        //only do stuff if it is an art page
        if (artStage.length !== 0) {
            let authorNode = document.querySelector('#picBox .boxtitle a');            
            let titleNode = document.querySelector('#picBox h2.titleSemantic');
            let imageNode = document.querySelector('#picBox .boxbody img');
    
            let result = {
                author: authorNode.textContent,
                title: titleNode.textContent,
                href: imageNode.src
            };        
            sendToBackend({mediaData: result, downloadInExtension: true});  
        }
    }   
 
    async function scrapeSauceNao(href) {
        if (document.getElementById('searchForm') && href !== undefined) {
            let input = document.getElementById('urlInput');

            input.focus();
            await timeout(getRandomArbitrary(50,250));
            input.value = href;
            await timeout(getRandomArbitrary(50,250));
            input.blur();
            await timeout(getRandomArbitrary(25,100));
            document.getElementById('searchButton').click();
        }
    }   

    sendToBackend({pageReady: true});

})();