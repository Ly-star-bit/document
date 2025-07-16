import 'ranui/button';
import { testS3Connection } from './s3';

const SETTINGS_KEY = 's3_settings';

export interface S3Settings {
  endpoint: string;
  bucketName: string;
  region?: string; // region is now optional
  accessKeyId: string;
  secretAccessKey: string;
  isMinio?: boolean; // Added for MinIO compatibility
}

export function saveS3Settings(settings: S3Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function getS3Settings(): S3Settings | null {
  const settings = localStorage.getItem(SETTINGS_KEY);
  if (settings) {
    try {
      return JSON.parse(settings) as S3Settings;
    } catch (e) {
      console.error('Failed to parse S3 settings from localStorage', e);
      return null;
    }
  }
  return null;
}

function createInputElement(id: string, placeholder: string, value: string, type = 'text') {
  const input = document.createElement('input');
  input.id = id;
  input.placeholder = placeholder;
  input.value = value;
  input.type = type;
  input.style.cssText = `
    width: 100%;
    padding: 8px 12px;
    border-radius: 4px;
    border: 1px solid #dcdfe6;
    font-size: 14px;
    margin-bottom: 16px;
    box-sizing: border-box;
  `;
  return input;
}

export function createSettingsModal() {
  const settings = getS3Settings();

  const modalContainer = document.createElement('div');
  modalContainer.id = 'settings-modal';
  modalContainer.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: none;
    justify-content: center;
    align-items: center;
    z-index: 2000;
  `;

  const modalContent = document.createElement('div');
  modalContent.style.cssText = `
    background: white;
    padding: 24px;
    border-radius: 8px;
    width: 90%;
    max-width: 500px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  `;

  modalContent.innerHTML = `
    <h2 style="margin-top: 0; margin-bottom: 24px; font-size: 20px; color: #1f1f1f;">S3-Compatible Storage Settings</h2>
    <div class="tab-content">
      <div id="s3-settings">
        <label for="s3-endpoint" style="display: block; margin-bottom: 8px; font-weight: 500;">Endpoint URL</label>
        <label for="s3-bucket-name" style="display: block; margin-bottom: 8px; font-weight: 500;">Bucket Name</label>
        <label for="s3-region" style="display: block; margin-bottom: 8px; font-weight: 500;">Region</label>
        <label for="s3-access-key-id" style="display: block; margin-bottom: 8px; font-weight: 500;">Access Key</label>
        <label for="s3-secret-access-key" style="display: block; margin-bottom: 8px; font-weight: 500;">Secret Key</label>
      </div>
    </div>
  `;

  const s3SettingsDiv = modalContent.querySelector('#s3-settings') as HTMLDivElement;

  const endpointInput = createInputElement('s3-endpoint', 'e.g., http://127.0.0.1:9000', settings?.endpoint || '');
  s3SettingsDiv.insertBefore(endpointInput, s3SettingsDiv.children[1]);

  const minioLabel = document.createElement('label');
  minioLabel.style.cssText = `
    display: flex;
    align-items: center;
    margin-bottom: 16px;
    font-size: 14px;
  `;
  const minioCheckbox = document.createElement('input');
  minioCheckbox.type = 'checkbox';
  minioCheckbox.id = 's3-is-minio';
  minioCheckbox.checked = settings?.isMinio || false;
  minioCheckbox.style.marginRight = '8px';
  minioLabel.appendChild(minioCheckbox);
  minioLabel.appendChild(document.createTextNode('Use MinIO (enables path-style access)'));
  s3SettingsDiv.insertBefore(minioLabel, s3SettingsDiv.children[2]);
  
  const bucketNameInput = createInputElement('s3-bucket-name', 'Your S3 bucket name', settings?.bucketName || '');
  s3SettingsDiv.insertBefore(bucketNameInput, s3SettingsDiv.children[4]);

  const regionInput = createInputElement('s3-region', 'e.g., us-east-1', settings?.region || '');
  s3SettingsDiv.insertBefore(regionInput, s3SettingsDiv.children[6]);

  const accessKeyIdInput = createInputElement('s3-access-key-id', 'Your access key', settings?.accessKeyId || '');
  s3SettingsDiv.insertBefore(accessKeyIdInput, s3SettingsDiv.children[8]);

  const secretAccessKeyInput = createInputElement('s3-secret-access-key', 'Your secret key', settings?.secretAccessKey || '', 'password');
  s3SettingsDiv.appendChild(secretAccessKeyInput);

  const testStatus = document.createElement('div');
  testStatus.id = 'test-status';
  testStatus.style.cssText = 'margin-top: 16px; font-size: 14px; min-height: 20px;';
  modalContent.appendChild(testStatus);

  const buttonContainer = document.createElement('div');
  buttonContainer.style.cssText = `
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 24px;
  `;

  const testButton = document.createElement('r-button');
  testButton.setAttribute('type', 'secondary');
  testButton.textContent = 'Test Connection';
  testButton.addEventListener('click', async () => {
    testStatus.textContent = 'Testing...';
    testStatus.style.color = '#1f1f1f';
    const result = await testS3Connection({
      endpoint: endpointInput.value,
      bucketName: bucketNameInput.value,
      region: regionInput.value,
      accessKeyId: accessKeyIdInput.value,
      secretAccessKey: secretAccessKeyInput.value,
      isMinio: minioCheckbox.checked,
    });
    if (result.success) {
      testStatus.textContent = 'Connection successful!';
      testStatus.style.color = '#52c41a';
    } else {
      testStatus.textContent = `Connection failed: ${result.error}`;
      testStatus.style.color = '#ff4d4f';
    }
  });

  const saveButton = document.createElement('r-button');
  saveButton.textContent = 'Save';
  saveButton.addEventListener('click', () => {
    testStatus.textContent = ''; // Clear status on save
    saveS3Settings({
      endpoint: endpointInput.value,
      bucketName: bucketNameInput.value,
      region: regionInput.value,
      accessKeyId: accessKeyIdInput.value,
      secretAccessKey: secretAccessKeyInput.value,
      isMinio: minioCheckbox.checked,
    });
    // Dispatch a custom event to notify other parts of the app that settings have changed
    document.dispatchEvent(new CustomEvent('s3-settings-saved'));
    modalContainer.style.display = 'none';
  });

  const closeButton = document.createElement('r-button');
  closeButton.setAttribute('type', 'secondary');
  closeButton.textContent = 'Close';
  closeButton.addEventListener('click', () => {
    testStatus.textContent = ''; // Clear status on close
    modalContainer.style.display = 'none';
  });

  buttonContainer.appendChild(testButton);
  buttonContainer.appendChild(closeButton);
  buttonContainer.appendChild(saveButton);
  modalContent.appendChild(buttonContainer);
  modalContainer.appendChild(modalContent);
  document.body.appendChild(modalContainer);
}

export function showSettingsModal() {
  let modal = document.getElementById('settings-modal');
  if (!modal) {
    createSettingsModal();
    modal = document.getElementById('settings-modal');
  }
  if(modal) {
    // Re-populate fields with latest settings every time it's shown
    const settings = getS3Settings();
    (modal.querySelector('#s3-endpoint') as HTMLInputElement).value = settings?.endpoint || '';
    (modal.querySelector('#s3-bucket-name') as HTMLInputElement).value = settings?.bucketName || '';
    (modal.querySelector('#s3-region') as HTMLInputElement).value = settings?.region || '';
    (modal.querySelector('#s3-access-key-id') as HTMLInputElement).value = settings?.accessKeyId || '';
    (modal.querySelector('#s3-secret-access-key') as HTMLInputElement).value = settings?.secretAccessKey || '';
    const minioCheckbox = modal.querySelector<HTMLInputElement>('#s3-is-minio');
    if (minioCheckbox) {
      minioCheckbox.checked = settings?.isMinio || false;
    }
    // Clear previous test status
    const testStatus = modal.querySelector<HTMLDivElement>('#test-status');
    if (testStatus) testStatus.textContent = '';
    modal.style.display = 'flex';
  }
} 