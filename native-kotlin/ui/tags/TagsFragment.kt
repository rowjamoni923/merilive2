package com.merilive.app.ui.tags

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import com.merilive.app.databinding.FragmentTagsBinding
import com.google.android.material.chip.Chip
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.postgrest.Postgrest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class TagsFragment : Fragment() {

    private var _binding: FragmentTagsBinding? = null
    private val binding get() = _binding!!
    private val viewModel: TagsViewModel by viewModels()

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentTagsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnBack.setOnClickListener { findNavController().navigateUp() }

        viewLifecycleOwner.lifecycleScope.launchWhenStarted {
            viewModel.categories.collect { categories ->
                binding.chipGroupTags.removeAllViews()
                categories.forEach { cat ->
                    // Category header chip (non-checkable)
                    val headerChip = Chip(requireContext()).apply {
                        text = "${cat.icon} ${cat.name}"
                        isCheckable = false
                        textSize = 14f
                        setChipBackgroundColorResource(android.R.color.transparent)
                    }
                    binding.chipGroupTags.addView(headerChip)

                    cat.tags.forEach { tag ->
                        val chip = Chip(requireContext()).apply {
                            text = "${tag.icon} ${tag.name}"
                            isCheckable = true
                            isChecked = viewModel.selectedTags.value.contains(tag.name)
                            setOnCheckedChangeListener { _, checked ->
                                viewModel.toggleTag(tag.name, checked)
                            }
                        }
                        binding.chipGroupTags.addView(chip)
                    }
                }
            }
        }

        binding.btnSave.setOnClickListener {
            viewModel.saveTags()
            Toast.makeText(requireContext(), "✅ Tags saved!", Toast.LENGTH_SHORT).show()
            findNavController().navigateUp()
        }

        viewModel.loadTags()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}

data class TagItem(val name: String, val icon: String)
data class TagCategory(val name: String, val icon: String, val tags: List<TagItem>)

@HiltViewModel
class TagsViewModel @Inject constructor(
    private val auth: Auth,
    private val postgrest: Postgrest,
) : ViewModel() {

    private val _categories = MutableStateFlow<List<TagCategory>>(emptyList())
    val categories = _categories.asStateFlow()

    private val _selectedTags = MutableStateFlow<Set<String>>(emptySet())
    val selectedTags = _selectedTags.asStateFlow()

    fun loadTags() {
        // Hardcoded categories matching web
        _categories.value = listOf(
            TagCategory("Preferences", "💕", listOf(
                TagItem("Seeking chat friends", "💬"),
                TagItem("Seeking short-term date", "🌹"),
                TagItem("Seeking a stable relationship", "💑"),
                TagItem("Seeking a life partner", "💍"),
                TagItem("Just browsing", "👀"),
                TagItem("Looking for fun", "🎉"),
            )),
            TagCategory("Personality", "🎭", listOf(
                TagItem("Introvert", "🤫"),
                TagItem("Extrovert", "🎤"),
                TagItem("Creative", "🎨"),
                TagItem("Adventurous", "🏔️"),
                TagItem("Bookworm", "📚"),
                TagItem("Night owl", "🦉"),
            )),
            TagCategory("Hobbies", "🎯", listOf(
                TagItem("Music", "🎵"),
                TagItem("Gaming", "🎮"),
                TagItem("Cooking", "🍳"),
                TagItem("Sports", "⚽"),
                TagItem("Travel", "✈️"),
                TagItem("Photography", "📸"),
            )),
        )

        // Load user's saved tags
        viewModelScope.launch {
            try {
                val userId = auth.currentSessionOrNull()?.user?.id ?: return@launch
                val profile = postgrest.from("profiles")
                    .select(columns = io.github.jan.supabase.postgrest.query.Columns.list("tags")) {
                        filter { eq("id", userId) }
                    }
                    .decodeSingleOrNull<TagsProfileResponse>()
                _selectedTags.value = profile?.tags?.toSet() ?: emptySet()
            } catch (_: Exception) {}
        }
    }

    fun toggleTag(tag: String, selected: Boolean) {
        _selectedTags.value = if (selected) {
            _selectedTags.value + tag
        } else {
            _selectedTags.value - tag
        }
    }

    fun saveTags() {
        viewModelScope.launch {
            try {
                val userId = auth.currentSessionOrNull()?.user?.id ?: return@launch
                postgrest.from("profiles")
                    .update(mapOf("tags" to _selectedTags.value.toList())) {
                        filter { eq("id", userId) }
                    }
            } catch (_: Exception) {}
        }
    }
}

@kotlinx.serialization.Serializable
data class TagsProfileResponse(
    val tags: List<String>? = null,
)
