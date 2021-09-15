


(async () => {


    let article = document.createElement("article");
    article.id = 'interface-query';
    article.classList = ["mdc-typography--body2 interface-card.mdc-card hidden"];
    

    let contentHTML = await fetch(extensionOrigin + '/content/interface_gallery.html');
    contentHTML = await contentHTML.text();
    article.innerHTML += contentHTML;
    document.body.appendChild(article);

    function timeout(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    function getRandomArbitrary(min, max) {
        return Math.random() * (max - min) + min;
    }
});