async function protectPage() {
  const { data } = await supabaseClient.auth.getSession();

  if (!data.session) {
    window.location.href = "login.html";
  }
}

protectPage();

document.getElementById("contact-form").addEventListener("submit", function (event) {
  event.preventDefault();

  const subject = document.getElementById("contact-subject").value;
  const message = document.getElementById("contact-message").value;

  const mailtoLink =
    `mailto:northxsystems@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;

  window.location.href = mailtoLink;
});

const logoutButton = document.getElementById("logout-button");

if (logoutButton) {
  logoutButton.addEventListener("click", async function () {
    await supabaseClient.auth.signOut();
    window.location.href = "login.html";
  });
}