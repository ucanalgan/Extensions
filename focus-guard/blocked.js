const params = new URLSearchParams(location.search);
const site = params.get("site") || "";
const key = params.get("key") || "";
const reason = params.get("reason") || "limit";

const bonusBtn = document.getElementById("bonus-btn");

if (reason === "focus") {
  document.getElementById("icon").textContent = "🎯";
  document.getElementById("title").textContent = "Odak modu aktif";
  document.getElementById("message").innerHTML = `<strong>${site}</strong>, aktif odak seansı bitene kadar izin verilenler listesinde değil.`;
  document.getElementById("submessage").textContent = "Odak modunu durdurmak için uzantı simgesine tıklayabilirsin.";
  bonusBtn.hidden = true;
} else {
  document.getElementById("message").innerHTML = `<strong>${site}</strong> için ayırdığın günlük süreyi kullandın.`;
  document.getElementById("submessage").textContent = "Limit her gün gece yarısı sıfırlanır.";
  bonusBtn.addEventListener("click", async () => {
    if (!key) return;
    const { bonus } = await getStore();
    const day = todayKey();
    bonus[day] = bonus[day] || {};
    bonus[day][key] = (bonus[day][key] || 0) + 5;
    await setStore({ bonus });
    history.back();
  });
}

document.getElementById("back-btn").addEventListener("click", () => {
  history.length > 1 ? history.back() : (location.href = "https://www.google.com");
});

document.getElementById("options-btn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
