document.addEventListener("DOMContentLoaded", function () {
  var abrirContacts = document.getElementById("abrirContacts");
  var copyName = document.getElementById("copyName");
  var copyNumber = document.getElementById("copyNumber");
  var buscarElixir = document.getElementById("buscarElixir");

  abrirContacts.addEventListener("click", function () {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        files: ["content.js"],
      });
    });
  });

  copyName.addEventListener("click", function () {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        files: ["copyname.js"],
      });
    });
  });

  copyNumber.addEventListener("click", function () {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        files: ["copynumber.js"],
      });
    });
  });

  buscarElixir.addEventListener("click", function () {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        files: ["buscarelixir.js"],
      });
    });
  });
});
