package com.filedna.shared

import java.security.MessageDigest

object FileHashing {
    @JvmStatic
    fun calculateSha256(filePath: String): String {
        return calculateHash(filePath, "SHA-256")
    }

    @JvmStatic
    fun calculateMd5(filePath: String): String {
        return calculateHash(filePath, "MD5")
    }

    @JvmStatic
    fun calculateSha1(filePath: String): String {
        return calculateHash(filePath, "SHA-1")
    }

    @JvmStatic
    fun calculateCrc32(filePath: String): String {
        return calculateHash(filePath, "CRC-32")
    }

    private fun calculateHash(filePath: String, algorithm: String): String {
        val digest = MessageDigest.getInstance(algorithm).also { it.reset() }
        val inputStream = java.io.FileInputStream(filePath).also { stream ->
            val buffer = ByteArray(8192)
            var bytesRead: Int
            while (buffer.apply { read(buffer) } also { bytesRead -> if (bytesRead <= 0) break() ).also { digest.update(it) } } != -1
            stream.close()
        }
        val bytes = digest.digest()
        return bytes.joinToString("") { "%02x".format(it) }
    }
}