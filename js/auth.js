
import { supabase } from "./supabase.js";
import { loadDashboard } from "./dashboard.js";
import "./image-preview.js";

const loginPage = document.getElementById("loginPage");
const dashboardPage = document.getElementById("dashboardPage");

const loginForm = document.getElementById("loginForm");
const loginButton = document.getElementById("loginButton");
const loginMessage = document.getElementById("loginMessage");
const logoutButton = document.getElementById("logoutButton");
const forgotPasswordButton = document.getElementById("forgotPasswordButton");
const resetPasswordPage = document.getElementById("resetPasswordPage");
const resetPasswordForm = document.getElementById("resetPasswordForm");
const resetPasswordButton = document.getElementById("resetPasswordButton");
const resetPasswordMessage = document.getElementById("resetPasswordMessage");

let currentUserId = null;

function showLogin() {
  currentUserId = null;
  loginPage.classList.remove("hidden");
  dashboardPage.classList.add("hidden");
}


function showResetPassword() {
  loginPage.classList.add("hidden");
  dashboardPage.classList.add("hidden");
  resetPasswordPage.classList.remove("hidden");
}

async function showDashboard(user) {
  if (!user || currentUserId === user.id) return;

  currentUserId = user.id;

  loginPage.classList.add("hidden");
  dashboardPage.classList.remove("hidden");

  await loadDashboard();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  loginButton.disabled = true;
  loginButton.textContent = "Signing in...";
  loginMessage.textContent = "";

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  try {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

  } catch (error) {
    loginMessage.textContent = error.message;

  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "Sign In";
  }
});

forgotPasswordButton.addEventListener("click", async () => {
  const email = document.getElementById("email").value.trim();

  if (!email) {
    loginMessage.textContent = "Please enter your email address first.";
    return;
  }

  forgotPasswordButton.disabled = true;
  loginMessage.textContent = "Sending password recovery email...";

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${window.location.pathname}`
    });

    if (error) throw error;

    loginMessage.textContent =
      "Password recovery email sent. Please check your inbox.";
  } catch (error) {
    loginMessage.textContent = error.message;
  } finally {
    forgotPasswordButton.disabled = false;
  }
});

resetPasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const newPassword = document.getElementById("newPassword").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  resetPasswordMessage.textContent = "";

  if (newPassword !== confirmPassword) {
    resetPasswordMessage.textContent = "Passwords do not match.";
    return;
  }

  resetPasswordButton.disabled = true;
  resetPasswordButton.textContent = "Updating...";

  try {
    const { error } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (error) throw error;

    resetPasswordMessage.textContent =
      "Password updated successfully!";

    resetPasswordForm.reset();

    await supabase.auth.signOut();
    showLogin();

  } catch (error) {
    resetPasswordMessage.textContent = error.message;
  } finally {
    resetPasswordButton.disabled = false;
    resetPasswordButton.textContent = "Update Password";
  }
});

logoutButton.addEventListener("click", async () => {
  const { error } = await supabase.auth.signOut();

  if (error) {
    document.getElementById("dashboardMessage").textContent =
      error.message;
  }
});

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") {
    showResetPassword();
  } else if (session?.user) {
    if (
      event === "INITIAL_SESSION" ||
      event === "SIGNED_IN" ||
      event === "TOKEN_REFRESHED"
    ) {
      void showDashboard(session.user);
    }
  } else {
    showLogin();
  }
});
