package com.filedna.shared

import java.io.File
import java.security.MessageDigest

class ScanEngine {

interface SL { fun onProgress(tf: Int, tp: Int, em: Long, erm: Long); fun onFP(p: String, s: String?); fun onSC(s: ScanSummary); fun onSE(e: String); fun onCN() }
interface FP { fun process(p: String, s: String?, sz: Long, c: String): Boolean }

data class SS(
    val tf: Int = 0,
    val tp: Int = 0,
    val tb: Long = 0,
    val em: Long = 0,
    val erm: Long = 0,
    val st: String = "idle",
    val err: Int = 0
)

data class SO(
    val md: Int = 50,
    val mfs: Long = 10L * 1024 * 1024 * 1024,
    val ep: List<String> = emptyList(),
    val ef: List<String> = listOf("node_modules", ".git", "$RECYCLE.BIN", "System Volume Information"),
    val fl: Boolean = false,
    val pl: SL? = null,
    val fp: FP? = null
)

private var st: String = "idle"
private var vd: Set<String> = emptySet()
private var stime: Long = 0
private var pr: Boolean = false
private var cr: Boolean = false
private var plc: SL? = null
private var fpc: FP? = null

fun scan(paths: List<String>, options: SO) {
    if (st != "idle") throw IllegalStateException("Scan already in progress")
    st = "scanning"
    vd = emptySet()
    pr = false
    cr = false
    stime = System.currentTimeMillis()
    plc = options.pl
    fpc = options.fp
    Thread {
        try { performScan(paths, options) }
        catch (e: Exception) {
            if (cr) { st = "cancelled"; plc?.onCN() }
            else { st = "error"; plc?.onSE(e.message ?: "Unknown error") }
        }
    }.start()
}

private fun performScan(paths: List<String>, options: SO) {
    val af = mutableListOf<String>()
    for (path in paths) discover(path, 0, options.ef, options.fl, af)
    val pf = mutableListOf<String>()
    for (fpath in af) {
        if (pr) { while (pr) { Thread.sleep(100); if (cr) { st = "cancelled"; plc?.onCN(); return } } }
        if (cr) { st = "cancelled"; plc?.onCN(); return }
        try {
            val file = File(fpath)
            if (!file.exists() || !file.isFile) continue
            if (file.length() > options.mfs) continue
            if (shouldEx(fpath, options.ep)) continue
            val sha = calculateSha256(fpath)
            if (fpc != null) {
                val cat = categorize(fpath)
                if (!fpc.process(fpath, sha, file.length(), cat)) continue
            }
            pf.add(fpath)
            val elapsed = System.currentTimeMillis() - stime
            val er = if (pf.size > 0) {
                val r = pf.size / (elapsed / 1000.0)
                (af.size - pf.size) / r * 1000
            } else 0L
            plc?.onProgress(af.size, pf.size, elapsed, er)
        } catch (_: Exception) { }
    }
    st = "complete"
    val ss = SS(tf = af.size, tp = pf.size, em = System.currentTimeMillis() - stime)
    plc?.onScanCompleted(ss)
}

private fun discover(d: String, depth: Int, ef: List<String>, fl: Boolean, af: MutableList<String>) {
    if (depth > md) return
    if (cr) return
    try {
        val file = File(d)
        if (!file.exists() || !file.isDirectory) return
        if (!fl && file.canonicalPath in vd) return
        if (!fl) vd.add(file.canonicalPath)
        val entries = file.listFiles()?.toList() ?: return
        for (e in entries) {
            if (cr) return
            if (e.isDirectory) { if (e.name in ef) continue; discover(e.absolutePath, depth + 1, ef, fl, af) }
            else if (e.isFile) { if (shouldEx(e.absolutePath, ef)) continue; af.add(e.absolutePath) }
        }
    } catch (_: SecurityException) { } catch (_: Exception) { }
}

private fun shouldEx(fp: String, ep: List<String>): Boolean {
    return ep.any { fp.contains(it) || fp.endsWith(it) }
}

private fun categorize(fp: String): String {
    val ext = fp.substringAfterLast(".").toLowerCase()
    return when (ext) {
        "jpg","jpeg","png","gif","webp","bmp","tiff","ico" -> "image"
        "mp3","wav","flac","ogg","m4a","aac","wma" -> "audio"
        "mp4","avi","mkv","mov","webm","flv" -> "video"
        "pdf","doc","docx","txt","rtf" -> "document"
        "zip","rar","7z","gz","tar" -> "archive"
        "exe","dll","bin","class" -> "executable"
        "js","py","html","css","java","kt" -> "code"
        else -> "other"
    }
}

private fun calculateSha256(fp: String): String {
    val digest = MessageDigest.getInstance("SHA-256")
    val file = File(fp)
    val fis = file.inputStream()
    val buffer = ByteArray(8192)
    var br: Int
    while (buffer.apply { read(buffer) } also { br -> if (br <= 0) break() }).also { digest.update(it) } != -1
    fis.close()
    val bytes = digest.digest()
    return bytes.joinToString("") { "%02x".format(it) }
}

fun pause() { pr = true }
fun resume() { pr = false }
fun cancel() { cr = true; pr = false }
fun getState(): String = st
}