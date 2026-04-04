package com.merilive.app.ui.poster

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.merilive.app.databinding.FragmentMyPosterBinding
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.storage.Storage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import javax.inject.Inject

@AndroidEntryPoint
class MyPosterFragment : Fragment() {

    private var _binding: FragmentMyPosterBinding? = null
    private val binding get() = _binding!!
    private val viewModel: MyPosterViewModel by viewModels()

    private val pickImage = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let { viewModel.uploadImage(requireContext(), it) }
    }

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentMyPosterBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnBack.setOnClickListener { findNavController().navigateUp() }
        binding.btnAddImage.setOnClickListener { pickImage.launch("image/*") }
        binding.rvImages.layoutManager = GridLayoutManager(requireContext(), 3)

        viewLifecycleOwner.lifecycleScope.launchWhenStarted {
            viewModel.images.collect { list ->
                binding.tvEmpty.visibility = if (list.isEmpty()) View.VISIBLE else View.GONE
                binding.tvCount.text = "${list.size}/6"
                binding.rvImages.adapter = PosterImageAdapter(list) { img ->
                    viewModel.deleteImage(img.id)
                }
            }
        }

        viewLifecycleOwner.lifecycleScope.launchWhenStarted {
            viewModel.message.collect { msg ->
                if (msg.isNotEmpty()) {
                    Toast.makeText(requireContext(), msg, Toast.LENGTH_SHORT).show()
                }
            }
        }

        viewModel.loadImages()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}

@HiltViewModel
class MyPosterViewModel @Inject constructor(
    private val auth: Auth,
    private val postgrest: Postgrest,
    private val storage: Storage,
) : ViewModel() {

    private val _images = MutableStateFlow<List<PosterImage>>(emptyList())
    val images = _images.asStateFlow()

    private val _message = MutableStateFlow("")
    val message = _message.asStateFlow()

    fun loadImages() {
        viewModelScope.launch {
            try {
                val userId = auth.currentSessionOrNull()?.user?.id ?: return@launch
                val result = postgrest.from("poster_images")
                    .select {
                        filter { eq("user_id", userId) }
                        order("display_order", io.github.jan.supabase.postgrest.query.Order.ASCENDING)
                    }
                    .decodeList<PosterImageResponse>()

                _images.value = result.map {
                    PosterImage(id = it.id, imageUrl = it.image_url, order = it.display_order ?: 0)
                }
            } catch (_: Exception) {}
        }
    }

    fun uploadImage(context: android.content.Context, uri: Uri) {
        viewModelScope.launch {
            try {
                val userId = auth.currentSessionOrNull()?.user?.id ?: return@launch
                val inputStream = context.contentResolver.openInputStream(uri) ?: return@launch
                val bytes = inputStream.readBytes()
                inputStream.close()

                val path = "posters/$userId/${System.currentTimeMillis()}.jpg"
                storage.from("avatars").upload(path, bytes)

                val publicUrl = storage.from("avatars").publicUrl(path)
                val order = _images.value.size + 1

                postgrest.from("poster_images").insert(mapOf(
                    "user_id" to userId,
                    "image_url" to publicUrl,
                    "display_order" to order,
                    "is_primary" to (order == 1),
                ))

                _message.value = "✅ Image uploaded!"
                loadImages()
            } catch (e: Exception) {
                _message.value = "❌ ${e.message}"
            }
        }
    }

    fun deleteImage(imageId: String) {
        viewModelScope.launch {
            try {
                postgrest.from("poster_images").delete { filter { eq("id", imageId) } }
                _message.value = "🗑️ Image removed"
                loadImages()
            } catch (e: Exception) {
                _message.value = "❌ ${e.message}"
            }
        }
    }
}

data class PosterImage(val id: String, val imageUrl: String, val order: Int)

@Serializable
data class PosterImageResponse(
    val id: String,
    val image_url: String,
    val display_order: Int? = null,
    val is_primary: Boolean? = null,
)

class PosterImageAdapter(
    private val items: List<PosterImage>,
    private val onDelete: (PosterImage) -> Unit,
) : RecyclerView.Adapter<PosterImageAdapter.VH>() {
    inner class VH(itemView: View) : RecyclerView.ViewHolder(itemView)
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val iv = ImageView(parent.context).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 300
            )
            scaleType = ImageView.ScaleType.CENTER_CROP
            setPadding(4, 4, 4, 4)
        }
        return VH(iv)
    }
    override fun onBindViewHolder(holder: VH, position: Int) {
        // Use Coil/Glide in production
        holder.itemView.setOnLongClickListener {
            onDelete(items[position])
            true
        }
    }
    override fun getItemCount() = items.size
}
