package com.merilive.app.util

import android.content.Context
import android.graphics.drawable.Drawable
import android.widget.ImageView
import coil.ImageLoader
import coil.decode.SvgDecoder
import coil.request.ImageRequest
import coil.transform.CircleCropTransformation
import coil.transform.RoundedCornersTransformation
import com.merilive.app.R

object ImageLoader {

    private var loader: ImageLoader? = null

    fun init(context: Context) {
        loader = ImageLoader.Builder(context)
            .components { add(SvgDecoder.Factory()) }
            .crossfade(true)
            .build()
    }

    private fun getLoader(context: Context): ImageLoader {
        return loader ?: ImageLoader.Builder(context)
            .crossfade(true)
            .build().also { loader = it }
    }

    fun loadAvatar(imageView: ImageView, url: String?, placeholder: Int = R.drawable.bg_avatar_placeholder) {
        val request = ImageRequest.Builder(imageView.context)
            .data(url)
            .placeholder(placeholder)
            .error(placeholder)
            .transformations(CircleCropTransformation())
            .target(imageView)
            .build()
        getLoader(imageView.context).enqueue(request)
    }

    fun loadImage(imageView: ImageView, url: String?, placeholder: Int = R.drawable.bg_card) {
        val request = ImageRequest.Builder(imageView.context)
            .data(url)
            .placeholder(placeholder)
            .error(placeholder)
            .target(imageView)
            .build()
        getLoader(imageView.context).enqueue(request)
    }

    fun loadRounded(imageView: ImageView, url: String?, radiusDp: Float = 12f) {
        val radiusPx = radiusDp * imageView.context.resources.displayMetrics.density
        val request = ImageRequest.Builder(imageView.context)
            .data(url)
            .transformations(RoundedCornersTransformation(radiusPx))
            .target(imageView)
            .build()
        getLoader(imageView.context).enqueue(request)
    }

    fun loadGift(imageView: ImageView, url: String?) {
        val request = ImageRequest.Builder(imageView.context)
            .data(url)
            .crossfade(300)
            .target(imageView)
            .build()
        getLoader(imageView.context).enqueue(request)
    }

    fun preload(context: Context, url: String?) {
        if (url.isNullOrEmpty()) return
        val request = ImageRequest.Builder(context)
            .data(url)
            .build()
        getLoader(context).enqueue(request)
    }
}