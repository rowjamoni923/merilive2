package com.merilive.app.ui.agency.adapter

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import coil.load
import coil.transform.CircleCropTransformation
import com.merilive.app.R
import com.merilive.app.data.repository.HostRequestData

class PendingRequestAdapter(
    private val onApprove: (String) -> Unit,
    private val onReject: (String) -> Unit,
) : ListAdapter<HostRequestData, PendingRequestAdapter.VH>(DIFF) {

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<HostRequestData>() {
            override fun areItemsTheSame(a: HostRequestData, b: HostRequestData) = a.id == b.id
            override fun areContentsTheSame(a: HostRequestData, b: HostRequestData) = a == b
        }
    }

    inner class VH(view: View) : RecyclerView.ViewHolder(view) {
        val ivAvatar: ImageView = view.findViewById(R.id.ivAvatar)
        val tvName: TextView = view.findViewById(R.id.tvName)
        val tvUid: TextView = view.findViewById(R.id.tvUid)
        val btnApprove: View = view.findViewById(R.id.btnApprove)
        val btnReject: View = view.findViewById(R.id.btnReject)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_pending_request, parent, false)
        return VH(view)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val req = getItem(position)
        holder.tvName.text = req.full_name ?: "User"
        holder.tvUid.text = "UID: ${req.user_id?.take(8) ?: "N/A"}"
        req.photo_url?.let {
            holder.ivAvatar.load(it) { transformations(CircleCropTransformation()) }
        }
        holder.btnApprove.setOnClickListener { onApprove(req.id) }
        holder.btnReject.setOnClickListener { onReject(req.id) }
    }
}
