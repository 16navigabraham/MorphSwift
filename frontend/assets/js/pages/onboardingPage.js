import { loginWithEmail } from '../magic.js';

function setLoading(button, label) {
  if (!button) return;
  button.dataset.originalLabel ??= button.textContent;
  button.disabled = true;
  button.textContent = label;
}

function clearLoading(button) {
  if (!button) return;
  button.disabled = false;
  button.textContent = button.dataset.originalLabel ?? button.textContent;
}

async function goToTerminal(email, source) {
  const status = document.getElementById('magic-sent');
  const emailForm = document.getElementById('email-form');
  const sentEmail = document.getElementById('sent-email');
  const googleButton = document.querySelector('.btn');
  const sendButton = document.querySelector('.btn-send');

  try {
    await loginWithEmail(email);
    if (emailForm) emailForm.style.display = 'none';
    if (status) status.classList.add('visible');
    if (sentEmail) sentEmail.textContent = email;
    setTimeout(() => {
      window.location.href = 'terminal.html?source=' + encodeURIComponent(source);
    }, 800);
  } catch (error) {
    console.error(error);
    clearLoading(googleButton);
    clearLoading(sendButton);
    alert(error.message || 'Unable to create session');
  }
}

async function handleGoogle() {
  const emailInput = document.getElementById('email-input');
  const button = document.querySelector('.btn');
  const email = (emailInput?.value || 'merchant@morphswift.app').trim() || 'merchant@morphswift.app';
  setLoading(button, 'Connecting to Google…');
  await goToTerminal(email, 'google');
}

async function handleMagicLink() {
  const input = document.getElementById('email-input');
  const button = document.querySelector('.btn-send');
  const email = input?.value?.trim() || '';

  if (!email || !email.includes('@')) {
    if (input) {
      input.style.borderColor = 'rgba(220,50,50,0.5)';
      input.focus();
      setTimeout(() => {
        input.style.borderColor = '';
      }, 2000);
    }
    return;
  }

  setLoading(button, 'Sending…');
  await goToTerminal(email, 'magic-link');
}

export function initOnboardingPage() {
  window.handleGoogle = handleGoogle;
  window.handleMagicLink = handleMagicLink;
}
