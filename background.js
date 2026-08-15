chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    if (message.action === "get-steam-cookies") {

        Promise.all([
            chrome.cookies.get({
                url: "https://steamcommunity.com/",
                name: "sessionid"
            }),

            chrome.cookies.get({
                url: "https://steamcommunity.com/",
                name: "steamLoginSecure"
            })
        ])
        .then(([sessionCookie, loginCookie]) => {

            sendResponse({
                ok: true,

                sessionid:
                    sessionCookie?.value || "",

                steamLoginSecure:
                    loginCookie?.value || ""
            });

        })
        .catch(error => {

            sendResponse({
                ok: false,

                error:
                    error?.message ||
                    "Unable to read Steam cookies."
            });

        });

        return true;
    }


    if (message.action === "open-steam") {

        chrome.tabs.create({
            url: "https://steamcommunity.com/my"
        });

        sendResponse({
            ok: true
        });

        return true;
    }

});