"use strict";

(async () => {
    const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
    const id = chrome.runtime.id;
    const mdc = window.mdc;
    const storageKey = 'squishMediaSaver-gallery';
   
    let isDown = false, offset = [], canOpen = true;
    let scrapeSettings = {};
    try {
        scrapeSettings = JSON.parse(sessionStorage.getItem(storageKey)) || {};
    } catch (e) {
        console.log(e);
    }
    console.log(scrapeSettings);
    if (scrapeSettings?.scrapeType) {
        canOpen = false;
    }

    let settings = {
        general: {
            saveAsDialog: false,
            inputDelay: 1000,
            darkmode: 'auto'
        }
    };

    let article = document.createElement("article");
    article.id = 'interface-query';
    article.classList = ["mdc-typography--body2 interface-card.mdc-card hidden"];
    

    let contentHTML = await fetch(chrome.runtime.getURL('/content/interface_gallery.html'));
    contentHTML = await contentHTML.text();
    article.innerHTML += contentHTML;
    document.body.appendChild(article);



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
    for (let i = 0; i < buttons?.length; i++) {
        new mdc.ripple.MDCRipple(buttons[i]);
    }
    let radios = {
        selectAll: new mdc.radio.MDCRadio(document.querySelector('#mdc-search-all')),
        searchDates: new mdc.radio.MDCRadio(document.querySelector('#mdc-search-by-date')),
        searchFilenumber: new mdc.radio.MDCRadio(document.querySelector('#mdc-search-by-filenumber'))
    };
    let textFields = {
        startDate: new mdc.textField.MDCTextField(document.getElementById('mdc-sq-date-start')),
        endDate: new mdc.textField.MDCTextField(document.getElementById('mdc-sq-date-end')),
        startNumber: new mdc.textField.MDCTextField(document.getElementById('mdc-sq-number-start')),
        endNumber: new mdc.textField.MDCTextField(document.getElementById('mdc-sq-number-end')),
    }
    let cancelButton = document.getElementById('sq-filename-cancel');
    let continueButton = document.getElementById('sq-filename-continue');
    [].forEach.call(
        document.querySelectorAll('.mdc-radio__native-control'),
        el => {
            el.addEventListener('click', handleRadios);
        }
    );
    let feedBack = document.getElementById('sq-scrape-info');

    function handleRadios(event) {
        switch (event.target.id) {
            case 'sq-search-by-filenumber':
                switchInputs('sq-search-by-filenumber');
                break;
            case 'sq-search-by-date':
                switchInputs('sq-search-by-date');
                break;          
            case 'sq-search-all':
                switchInputs('');
                break;
            default:
                switchInputs('');
                break;
        }
    }
    function switchInputs(targetId) {
        [].forEach.call(
            Object.values(textFields),
            el => el.disabled = true);

        switch (targetId) {
            case 'sq-search-by-filenumber':
                textFields.startNumber.disabled = false;
                textFields.endNumber.disabled = false;
                break;
            case 'sq-search-by-date':
                textFields.startDate.disabled = false;
                textFields.endDate.disabled = false;
                break;
            default:
                break;
        }
    }
    /**Handle buttons */
    cancelButton.addEventListener('click', reset);
    continueButton.addEventListener('click', e => {
        if (canOpen) {
            Object.assign(scrapeSettings, readValues());        
            article.classList.add('hidden');
            canOpen = false;
            processStufferDB();
        }
    });
    document.addEventListener('keydown', e => {
        switch (e.key) {
            case 'Escape':  
                reset();
                break;
            default:
                break;   
        }
        
        return true;
    });

    function reset() {
        console.log('Reset');
        article.classList.add('hidden');
        scrapeSettings = {};
        storeSettings(scrapeSettings);
        canOpen = true;
    }
    function storeSettings(scrapeSettings) {
        sessionStorage.setItem(storageKey,JSON.stringify(scrapeSettings));
    }
    function readValues() {
        let result = {
            scrapeType: radios.selectAll.checked ? 'all' : (radios.searchDates.checked ? 'date' : (radios.searchFilenumber.checked ? 'number' : 'invalid')),
            clamps: {
                date: {
                    start: new Date(textFields.startDate.value).toISOString(),
                    end: new Date(textFields.endDate.value).toISOString(),
                },
                number: {
                    start: parseInt(textFields.startNumber.value),
                    end: parseInt(textFields.endNumber.value) 
                }
            }
        }
       
        if (result.clamps.date.end < result.clamps.date.start) {
            result.clamps.date.end = result.clamps.date.start;
            result.clamps.date.start = textFields.endDate.value;
        }
        if (result.clamps.number.end < result.clamps.number.start) {
            result.clamps.number.end = result.clamps.number.start;
            result.clamps.number.start = textFields.endNumber.value;
        }
        if (result.scrapeType.date === true && result.clamps.date.start === '' && result.clamps.date.end === '' ||
            result.scrapeType.number === true && result.clamps.number.start === '' && result.clamps.number.end === '') {
            result = {}
        }

        return result;
    }

    async function processStufferDB() {
        if (canOpen) {
            return false;
        }

        let content = scrapeStufferDB();

        //Wrong page, abort progress -> possible user interference
        if ((content.status === 'media' && content.pages.media.folder !== scrapeSettings.folderName) || (content.status === 'folder' && content.pages.folder.name !== scrapeSettings.folderName)) {
            console.log('Wrong page. Aborting.');
            reset();
            return false;
        }
        if (content.status === 'folder' && content.pages.folder.images.length <= 0) {
            console.log('Folder has no images.');
            reset();
            return false;
        }

        await timeout(getRandomArbitrary(300,750));

        if (scrapeSettings.status?.type === 'setup') {
            if (scrapeSettings.scrapeType === 'all') {
                if (content.status === 'media' && content.pages.media.position === 'first') {
                    scrapeSettings.status = {
                        type: 'process',
                        direction: 'next'
                    }
                } else if (content.status === 'media' && content.pages.media.position !== 'first') {
                    storeSettings(scrapeSettings);
                    window.open(content.pages.media.up.href, "_self");
                    return true;
                } else if (content.status === 'folder') {
                    scrapeSettings.status = {
                        type: 'process',
                        direction: 'next'
                    }
                    storeSettings(scrapeSettings);
                    content.pages.folder.images[0].click();
                    return true;
                }
            } else if (scrapeSettings.scrapeType === 'number') {
                if (scrapeSettings.clamps.number.start > scrapeSettings.total) {
                    reset();
                    return false;
                }
                if (content.status === 'media' && content.pages.media.number === scrapeSettings.clamps.number.start) {
                    scrapeSettings.status = {
                        type: 'process',
                        direction: 'next'
                    }
                } else if (content.status === 'media' && content.pages.media.number !== scrapeSettings.clamps.number.start) {
                    scrapeSettings.status = {
                        type: 'setup',
                        direction: 'getFirst'
                    }
                    storeSettings(scrapeSettings);
                    window.open(getOffsetFolder(content.pages.media.up.href, scrapeSettings.clamps.number.start), "_self");
                    return true;
                } else if (content.status === 'folder' && scrapeSettings.status.direction === 'getFirst') {
                    scrapeSettings.status = {
                        type: 'process',
                        direction: 'next'
                    }
                    storeSettings(scrapeSettings);
                    content.pages.folder.images[0].click();
                    return true;
                } else if (content.status === 'folder' && content.pages.folder.images.length > scrapeSettings.clamps.number.start) {
                    scrapeSettings.status = {
                        type: 'setup',
                        direction: 'getFirst'
                    }
                    storeSettings(scrapeSettings);
                    window.open(getOffsetFolder(window.location, scrapeSettings.clamps.number.start), "_self");
                    return true;
                } else if (content.status === 'folder' && content.pages.folder.images.length < scrapeSettings.clamps.number.start) {
                    scrapeSettings.status = {
                        type: 'process',
                        direction: 'next'
                    }
                    storeSettings(scrapeSettings);
                    content.pages.folder.images[scrapeSettings.clamps.number.start-1].click();
                    return true;
                }
            } else if (scrapeSettings.scrapeType === 'date') {
                if (content.status === 'media' && 
                    isBetween(scrapeSettings.clamps.date.start, scrapeSettings.clamps.date.end, content.pages.media.date)) {
                    storeSettings(scrapeSettings);
                    window.open(content.pages.media.up.href, "_self");
                    return true;
                } else if (content.status === 'media' && content.pages.media.date < scrapeSettings.clamps.date.start) {
                    scrapeSettings.status = {
                        type: 'process',
                        direction: 'prev'
                    }
                } else if (content.status === 'media' && content.pages.media.date > scrapeSettings.clamps.date.end) {
                    scrapeSettings.status = {
                        type: 'process',
                        direction: 'next'
                    }
                } else if (content.status === 'folder') {
                    scrapeSettings.status = {
                        type: 'process',
                        direction: 'next'
                    }
                    storeSettings(scrapeSettings);
                    content.pages.folder.images[0].click();
                    return true;
                }
            }
        }
        if (scrapeSettings.status?.type === 'process' && content.status === 'media') {
            if (scrapeSettings.scrapeType === 'all' ||
                (scrapeSettings.scrapeType ==='date' && isBetween(scrapeSettings.clamps.date.start, scrapeSettings.clamps.date.start, content.pages.media.date)) ||
                (scrapeSettings.scrapeType ==='number' && isBetween(scrapeSettings.clamps.number.start, scrapeSettings.clamps.number.end, content.pages.media.number))) {
                //console.log('Download ' + content.pages.media.number);
                if (content.pages.media.download?.href) {
                    await sendToBackend({mediaData: {
                        author: '',
                        title: content.pages.media.name,
                        href: content.pages.media.download?.href,
                        fileType: content.pages.media.fileType,
                        onlyTitle: true
                    }, downloadInExtension: true, finalDownload: true});
                }
                storeSettings(scrapeSettings);
                if (scrapeSettings.status.direction === 'prev' && content.pages.media.position !== 'first') {
                    window.open(content.pages.media.prev.href, "_self");
                    return true;
                } else if (scrapeSettings.status.direction === 'next' && content.pages.media.position !== 'last' ) {
                    window.open(content.pages.media.next.href, "_self");
                    return true;
                } else {
                    console.log('Finished');
                    reset();
                    return false;
                }
            } else if (scrapeSettings.status.direction === 'next' && content.pages.media.position !== 'last' &&
                ((scrapeSettings.scrapeType ==='all' && content.pages.media.number < scrapeSettings.total) &&
                (scrapeSettings.scrapeType ==='number' && content.pages.media.number < scrapeSettings.clamps.number.end) ||
                (scrapeSettings.scrapeType ==='date' && content.pages.media.date > scrapeSettings.clamps.date.start))) {
                console.log('next');
                window.open(content.pages.media.next.href, "_self");
                return true;
            } else if (scrapeSettings.status.direction === 'prev' && content.pages.media.position !== 'first' &&
                ((scrapeSettings.scrapeType ==='all' && content.pages.media.number > 0) &&
                (scrapeSettings.scrapeType ==='number' && content.pages.media.number > scrapeSettings.clamps.number.start) ||
                (scrapeSettings.scrapeType ==='date' && content.pages.media.date < scrapeSettings.clamps.date.end))) {
                console.log('prev');
                window.open(content.pages.media.prev.href, "_self");
                return true;
            } else {
                console.log('Finished');
                reset();
                return false;
            }
        } 
        
        //if an error, reset
        console.log('Traversing failed. Reset.');
        reset();
        return false;
        

        function getOffsetFolder(href, index) {
            let url = new URL(href);

            url.search = (url?.search?.match(/(\?\/category\/\d+)|(\?\/\d+\/category)/gi)?.[0] || '?') + '/start-' + (index-1);
            return url;
        }
    }

    function setupStufferDB() {
        if (canOpen) {
            let content = scrapeStufferDB();

            if (content.status === 'index' || content.status === '') {
                return false;
            }

            scrapeSettings = {
                folderName: content.pages.media.folder || content.pages.folder.name,
                total: content.pages.media.total || content.pages.folder.total,
                status: {
                    type: 'setup'
                }
            }

            textFields.startNumber.value = content.pages.media.number || 1;
            textFields.endNumber.value = scrapeSettings.total || 1;
            textFields.startDate.value = new Date(content.pages.media.date || Date.now()).toISOString().split('T')[0];
            textFields.endDate.value = new Date().toISOString().split('T')[0];

            feedBack.textContent = scrapeSettings.folderName;
            console.log(scrapeSettings);

            return true;
        }
        return false;
    }
    function scrapeStufferDB() {
        let result = {
            status: '',
            pages: {
                media: {
                    folder: document.querySelector('#imageHeaderBar .browsePath a:last-of-type')?.textContent || '',
                    number: parseInt(document.querySelector('#imageToolBar .imageNumber')?.textContent.match(/^\d+/g)[0] || 0),
                    total: parseInt(document.querySelector('#imageToolBar .imageNumber')?.textContent.match(/\d+$/g)[0] || 0),
                    date: new Date(document.querySelector('div#datepost a')?.href.match(/(\d+-\d+-\d+)$/gi)?.[0] || Date.now()).toISOString(),
                    download: document.querySelector('#imageToolBar a[download]'),
                    prev: document.querySelector('[rel="prev"]'),
                    next: document.querySelector('[rel="next"]'), 
                    up: document.querySelector('[rel="up"]'),
                    name: document.querySelector('#imageHeaderBar .browsePath font')?.textContent || 
                        document.querySelector('#File dd')?.textContent?.split('./upload/')?.[1] || '',
                    fileType: document.querySelector('#File dd')?.textContent?.match(/[\w\d]+$/g)?.[0] || ''
                },
                folder: {
                    name: document.querySelector('#content>.titrePage h2 a:last-of-type')?.textContent || '',
                    albums: document.querySelectorAll('#content .thumbnails li.album a'),
                    images: document.querySelectorAll('#content .thumbnails li:not(.album) a'),
                    hasMore: document.querySelector('.navigationBar [rel="next"]') ? true : false,
                    total: parseInt(document.querySelector('#content>.titrePage h2')?.textContent?.match(/\[\d+\]/g)?.[0]?.replace(/[\[\]]/g, '') || 0)
                }, 
                index: {
                    isIndex: document.querySelector('[rel="canonical"][href="/"]') || false
                }
            },
            
        };
        if (!result.pages.media.prev) {
            result.pages.media.position = 'first'
        } else if (!result.pages.media.next) {
            result.pages.media.position = 'last'
        } else {
            result.pages.media.position = 'middle'
        }
     
        if (result.pages.folder.name !== '') {
            result.status = 'folder';
        }
        if (result.pages.media.folder !== '') {
            result.status = 'media';
        }
        if (result.pages.index.isIndex) {
            result.status = 'index';
        }
        console.log(result);
        return result;
    }
    /**Helper functions */
    function timeout(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    function isBetween(low, high, value) {
        return value >= low && value <= high;
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


    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (sender.id === id && request?.squishImageSaver) {
            if (request.squishImageSaver.settings) {
                settings = request.squishImageSaver.settings;
            }
            switchDarkModes(article, settings.general.darkmode);

            switch(window.location.hostname) {
                case 'stufferdb.com': 
                    if (setupStufferDB()) {
                        article.classList.remove('hidden');
                    }
                    break;
                default:
                    break;
            }
        }
    });
    if (window.location.hostname === 'stufferdb.com') {
        processStufferDB();
    }
}) ();