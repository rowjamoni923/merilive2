package com.merilive.app.ui.common

import android.app.Dialog
import android.content.Context
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.ProgressBar
import android.widget.TextView
import androidx.fragment.app.DialogFragment
import com.google.android.material.button.MaterialButton
import com.merilive.app.R

/**
 * Reusable loading dialog
 */
class LoadingDialog : DialogFragment() {
    private var message: String = "Loading..."

    companion object {
        fun newInstance(message: String = "Loading..."): LoadingDialog {
            return LoadingDialog().apply { this.message = message }
        }
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        val view = inflater.inflate(R.layout.dialog_loading, container, false)
        view.findViewById<TextView>(R.id.tvMessage).text = message
        return view
    }

    override fun onCreateDialog(savedInstanceState: Bundle?): Dialog {
        return super.onCreateDialog(savedInstanceState).apply {
            setCancelable(false)
            setCanceledOnTouchOutside(false)
        }
    }
}

/**
 * Reusable confirmation dialog
 */
class ConfirmDialog : DialogFragment() {
    private var title: String = ""
    private var message: String = ""
    private var positiveText: String = "Confirm"
    private var negativeText: String = "Cancel"
    private var onConfirm: (() -> Unit)? = null
    private var onCancel: (() -> Unit)? = null

    companion object {
        fun newInstance(
            title: String,
            message: String,
            positiveText: String = "Confirm",
            negativeText: String = "Cancel",
            onConfirm: () -> Unit,
            onCancel: (() -> Unit)? = null,
        ): ConfirmDialog {
            return ConfirmDialog().apply {
                this.title = title
                this.message = message
                this.positiveText = positiveText
                this.negativeText = negativeText
                this.onConfirm = onConfirm
                this.onCancel = onCancel
            }
        }
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        val view = inflater.inflate(R.layout.dialog_confirm, container, false)
        view.findViewById<TextView>(R.id.tvTitle).text = title
        view.findViewById<TextView>(R.id.tvMessage).text = message
        view.findViewById<MaterialButton>(R.id.btnConfirm).apply {
            text = positiveText
            setOnClickListener { onConfirm?.invoke(); dismiss() }
        }
        view.findViewById<MaterialButton>(R.id.btnCancel).apply {
            text = negativeText
            setOnClickListener { onCancel?.invoke(); dismiss() }
        }
        return view
    }
}

/**
 * Reusable empty state view helper
 */
object EmptyStateHelper {
    fun show(container: View, message: String = "No data found", icon: String = "📭") {
        container.visibility = View.VISIBLE
        container.findViewById<TextView>(R.id.tvEmptyMessage)?.text = message
        container.findViewById<TextView>(R.id.tvEmptyIcon)?.text = icon
    }

    fun hide(container: View) {
        container.visibility = View.GONE
    }
}