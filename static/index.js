document.addEventListener('DOMContentLoaded', function() {
    // Tab switching functionality
    const loginTab = document.getElementById('login-tab');
    const signupTab = document.getElementById('signup-tab');
    const loginFormContainer = document.getElementById('login-form-container');
    const signupFormContainer = document.getElementById('signup-form-container');
    const statusElement = document.getElementById('status');
    
    loginTab.addEventListener('click', function() {
      loginTab.classList.add('active');
      signupTab.classList.remove('active');
      loginFormContainer.classList.add('active');
      signupFormContainer.classList.remove('active');
      statusElement.textContent = '';
    });
    
    signupTab.addEventListener('click', function() {
      signupTab.classList.add('active');
      loginTab.classList.remove('active');
      signupFormContainer.classList.add('active');
      loginFormContainer.classList.remove('active');
      statusElement.textContent = '';
    });
    
    // Login form submission
    const loginForm = document.getElementById('login-form');
    loginForm.addEventListener('submit', async function(event) {
      event.preventDefault();
      const username = document.getElementById('login-username').value;
      const password = document.getElementById('login-password').value;
      
      try {
        const response = await fetch('http://localhost:8000/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        
        if (response.ok) {
          const data = await response.json();
          statusElement.textContent = 'Login successful! Redirecting...';
          statusElement.style.color = '#2ecc71';
          setTimeout(() => {
            window.location.href = `/static/chat.html?username=${encodeURIComponent(username)}`;
          }, 1000);
        } else {
          const error = await response.json();
          statusElement.textContent = `Login failed: ${error.detail || 'Unknown error'}`;
          statusElement.style.color = '#f44336';
        }
      } catch (error) {
        statusElement.textContent = `Error: ${error.message}`;
        statusElement.style.color = '#f44336';
      }
    });
    
  
    
    // Signup form submission
    const signupForm = document.getElementById('signup-form');
    signupForm.addEventListener('submit', async function(event) {
      event.preventDefault();
      const username = document.getElementById('signup-username').value;
      const email = document.getElementById('signup-email').value;
      const password = document.getElementById('signup-password').value;
      const confirmPassword = document.getElementById('signup-confirm').value;
      
      if (password !== confirmPassword) {
        statusElement.textContent = 'Passwords do not match';
        statusElement.style.color = '#f44336';
        return;
      }
      
      try {
        await OQS().then(async function(OQSModule) {
          const publicKeyLength = OQSModule._get_kyber_768_public_key_length();
          const secretKeyLength = OQSModule._get_kyber_768_secret_key_length();
          const publicKey = new Uint8Array(publicKeyLength);
          const privateKey = new Uint8Array(secretKeyLength);
          OQSModule._kyber_generate_keypair(publicKey, privateKey);
          
          // Store private key with user-specific key
          localStorage.setItem(getUserKey(username, 'kyber_private_key'), arrayBufferToBase64(privateKey));
          
          const signupData = {
            username: username,
            email: email,
            password: password,
            public_key: arrayBufferToBase64(publicKey),
          };
          
          const response = await fetch('http://localhost:8000/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(signupData),
          });
          
          if (response.ok) {
            statusElement.textContent = 'Registration successful! Redirecting to login...';
            statusElement.style.color = '#2ecc71';
            setTimeout(() => {
              // Switch to login tab after successful registration
              loginTab.click();
            }, 1000);
          } else {
            const error = await response.json();
            statusElement.textContent = `Registration failed: ${error.detail || 'Unknown error'}`;
            statusElement.style.color = '#f44336';
          }
        });
      } catch (error) {
        statusElement.textContent = `Error: ${error.message}`;
        statusElement.style.color = '#f44336';
      }
    });
  });
  
  // Helper function to convert ArrayBuffer to Base64 string
  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  // User-specific localStorage helper functions
  function getUserKey(username, key) {
    return `user_${username}_${key}`;
  }

  function setUserItem(username, key, value) {
    localStorage.setItem(getUserKey(username, key), value);
  }

  function getUserItem(username, key) {
    return localStorage.getItem(getUserKey(username, key));
  }

  function removeUserItem(username, key) {
    localStorage.removeItem(getUserKey(username, key));
  }

  function clearUserStorage(username) {
    const userPrefix = `user_${username}_`;
    
    // Get all keys in localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      
      // Remove only keys that belong to this user
      if (key && key.startsWith(userPrefix)) {
        localStorage.removeItem(key);
      }
    }
  }
