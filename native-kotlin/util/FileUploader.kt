package com.merilive.app.util

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import io.github.jan.supabase.storage.Storage
import io.github.jan.supabase.storage.upload
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID

data class UploadResult(
    val publicUrl: String,
    val path: String,
    val bucket: String,
)

class FileUploader(
    private val storage: Storage,
) {
    suspend fun uploadImage(
        context: Context,
        uri: Uri,
        bucket: String = "avatars",
        folder: String = "",
    ): UploadResult = withContext(Dispatchers.IO) {
        val bytes = context.contentResolver.openInputStream(uri)?.readBytes()
            ?: throw Exception("Cannot read file")

        val fileName = getFileName(context, uri) ?: "${UUID.randomUUID()}.jpg"
        val path = if (folder.isNotEmpty()) "$folder/$fileName" else fileName

        storage.from(bucket).upload(path, bytes) {
            upsert = true
        }

        val publicUrl = storage.from(bucket).publicUrl(path)
        UploadResult(publicUrl = publicUrl, path = path, bucket = bucket)
    }

    suspend fun uploadBytes(
        bytes: ByteArray,
        bucket: String,
        path: String,
    ): UploadResult = withContext(Dispatchers.IO) {
        storage.from(bucket).upload(path, bytes) {
            upsert = true
        }
        val publicUrl = storage.from(bucket).publicUrl(path)
        UploadResult(publicUrl = publicUrl, path = path, bucket = bucket)
    }

    suspend fun deleteFile(bucket: String, path: String) = withContext(Dispatchers.IO) {
        storage.from(bucket).delete(path)
    }

    private fun getFileName(context: Context, uri: Uri): String? {
        var name: String? = null
        val cursor = context.contentResolver.query(uri, null, null, null, null)
        cursor?.use {
            if (it.moveToFirst()) {
                val idx = it.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (idx >= 0) name = it.getString(idx)
            }
        }
        return name
    }
}