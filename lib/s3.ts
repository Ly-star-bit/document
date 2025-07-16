import { GetObjectCommand, S3Client, ListObjectsV2Command, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getS3Settings, S3Settings } from './settings';

export interface S3File {
  key: string;
  lastModified?: Date;
  size?: number;
}

export interface ListS3FilesResult {
  files: S3File[];
  nextContinuationToken?: string;
}

function getS3Client() {
  const settings = getS3Settings();
  if (!settings || !settings.endpoint || !settings.accessKeyId || !settings.secretAccessKey) {
    // Alert is now conditional, shown only by functions that interact with the user
    return null;
  }

  // Sanitize endpoint URL to remove any trailing slashes
  const endpoint = settings.endpoint.replace(/\/$/, '');
  const clientSettings = {
    endpoint: endpoint, // Added for MinIO compatibility
    region: settings.region || 'us-east-1', // Default region for compatibility
    credentials: {
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
    },
    forcePathStyle: !!settings.isMinio, // Crucial for MinIO
  };
  console.log('Creating S3 client with settings:', {
    endpoint: clientSettings.endpoint,
    region: clientSettings.region,
  });
  return new S3Client(clientSettings);
}

export async function testS3Connection(settings: S3Settings): Promise<{ success: boolean; error?: string }> {
  if (!settings.endpoint || !settings.accessKeyId || !settings.secretAccessKey) {
    return { success: false, error: 'Endpoint, Access Key, and Secret Key are required.' };
  }
  if (!settings.bucketName) {
    return { success: false, error: 'Bucket Name is required to test the connection.' };
  }
    // Sanitize endpoint URL to remove any trailing slashes
    const endpoint = settings.endpoint.replace(/\/$/, '');
    const finalSettingsForTest = {
      endpoint: endpoint,
      region: settings.region || 'us-east-1', // Default region for compatibility
      credentials: {
        accessKeyId: settings.accessKeyId,
        secretAccessKey: settings.secretAccessKey,
      },
      forcePathStyle: !!settings.isMinio,
    };
    console.log('Attempting to test S3 connection with settings:', {
      endpoint: finalSettingsForTest.endpoint,
      region: finalSettingsForTest.region,
      bucketName: settings.bucketName,
    });
    const s3Client = new S3Client(finalSettingsForTest);

    const command = new ListObjectsV2Command({
        Bucket: settings.bucketName,
        MaxKeys: 1, 
    });

    try {
        await s3Client.send(command);
        return { success: true };
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error('S3 Connection Test Failed:', errorMessage);
        return { success: false, error: errorMessage };
    }
}

export async function listS3Files(options: {
  continuationToken?: string;
  prefix?: string;
  maxKeys?: number;
}): Promise<ListS3FilesResult> {
  const s3Client = getS3Client();
  if (!s3Client) {
    alert('S3 settings are not configured. Please configure them in the settings menu.');
    return { files: [], nextContinuationToken: undefined };
  }

  const settings = getS3Settings();
  if (!settings || !settings.bucketName) {
    return { files: [], nextContinuationToken: undefined };
  }

  const command = new ListObjectsV2Command({
    Bucket: settings.bucketName,
    ContinuationToken: options.continuationToken,
    Prefix: options.prefix,
    MaxKeys: options.maxKeys || 50, // Default to 50 items per page
  });

  try {
    const response = await s3Client.send(command);
    const files =
      response.Contents?.map(
        (item) =>
          ({
            key: item.Key || '',
            lastModified: item.LastModified,
            size: item.Size,
          } as S3File),
      ).filter((item) => item.key) || [];

    return {
      files,
      nextContinuationToken: response.NextContinuationToken,
    };
  } catch (err) {
    console.error('Error listing files from S3:', err);
    alert(`Failed to list files from S3. Error: ${err instanceof Error ? err.message : String(err)}`);
    return { files: [], nextContinuationToken: undefined };
  }
}

export async function uploadToS3(fileKey: string, data: Uint8Array): Promise<{ success: boolean; error?: string }> {
  const s3Client = getS3Client();
  if (!s3Client) {
    const error = 'S3 settings are not configured. Please configure them in the settings menu.';
    alert(error);
    return { success: false, error };
  }

  const settings = getS3Settings();
  if (!settings || !settings.bucketName) {
    const error = 'S3 bucket name is not configured.';
    alert(error);
    return { success: false, error };
  }

  const command = new PutObjectCommand({
    Bucket: settings.bucketName,
    Key: fileKey,
    Body: data,
  });

  try {
    await s3Client.send(command);
    console.log(`File uploaded successfully to S3: ${fileKey}`);
    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('Error uploading to S3:', errorMessage);
    alert(`Failed to upload file to S3. Error: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

export async function downloadFromS3(fileKey: string): Promise<File | null> {
  const s3Client = getS3Client();
  if (!s3Client) {
    alert('S3 settings are not configured. Please configure them in the settings menu.');
    return null;
  }
  
  const settings = getS3Settings();
  if (!settings || !settings.bucketName) {
    alert('S3 bucket name is not configured.');
    return null;
  }

  const command = new GetObjectCommand({
    Bucket: settings.bucketName,
    Key: fileKey,
  });

  try {
    const response = await s3Client.send(command);
    if (!response.Body || response.ContentLength === undefined || response.ContentLength <= 0) {
      throw new Error('Empty file from S3 or unknown content length.');
    }
    const body = await response.Body.transformToByteArray();
    // Create a new Uint8Array to ensure it's backed by an ArrayBuffer, not a SharedArrayBuffer.
    const blobPart = new Uint8Array(body);
    
    // 确保文件名和MIME类型正确
    const fileName = fileKey.split('/').pop() || fileKey;
    let mimeType = response.ContentType || '';
    
    // 如果是Excel文件，确保MIME类型正确
    if (fileName.toLowerCase().endsWith('.xlsx')) {
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else if (fileName.toLowerCase().endsWith('.xls')) {
      mimeType = 'application/vnd.ms-excel';
    }
    
    const file = new File([blobPart], fileName, { type: mimeType });
    console.log('Downloaded file:', { name: file.name, type: file.type, size: file.size });
    return file;
  } catch (err) {
    console.error('Error downloading from S3:', err);
    // It's helpful to alert the user that the download failed.
    alert(`Failed to download file from S3. Error: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}

export async function deleteFromS3(fileKey: string): Promise<{ success: boolean; error?: string }> {
  const s3Client = getS3Client();
  if (!s3Client) {
    const error = 'S3 settings are not configured. Please configure them in the settings menu.';
    alert(error);
    return { success: false, error };
  }

  const settings = getS3Settings();
  if (!settings || !settings.bucketName) {
    const error = 'S3 bucket name is not configured.';
    alert(error);
    return { success: false, error };
  }

  const command = new DeleteObjectCommand({
    Bucket: settings.bucketName,
    Key: fileKey,
  });

  try {
    await s3Client.send(command);
    console.log(`File deleted successfully from S3: ${fileKey}`);
    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('Error deleting from S3:', errorMessage);
    alert(`Failed to delete file from S3. Error: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}