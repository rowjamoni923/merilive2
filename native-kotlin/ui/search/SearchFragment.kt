package com.merilive.app.ui.search

import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.ImageView
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.ViewModel
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.viewModelScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import com.merilive.app.R
import com.merilive.app.databinding.FragmentSearchBinding
import com.merilive.app.data.repository.*
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.query.Columns
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import javax.inject.Inject

@AndroidEntryPoint
class SearchFragment : Fragment() {

    private var _binding: FragmentSearchBinding? = null
    private val binding get() = _binding!!
    private val viewModel: SearchViewModel by viewModels()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentSearchBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.rvResults.layoutManager = LinearLayoutManager(requireContext())
        binding.btnBack.setOnClickListener { findNavController().navigateUp() }

        // Search tabs
        binding.tabUsers?.setOnClickListener { viewModel.setSearchType("users") }
        binding.tabRooms?.setOnClickListener { viewModel.setSearchType("rooms") }

        binding.etSearch?.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                viewModel.search(s.toString())
            }
        })

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.results.collect { users ->
                binding.rvResults.adapter = UserSearchAdapter(users) { user ->
                    val bundle = Bundle().apply { putString("userId", user.id) }
                    findNavController().navigate(R.id.userProfileFragment, bundle)
                }
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.roomResults.collect { rooms ->
                if (rooms.isNotEmpty()) {
                    binding.rvResults.adapter = RoomSearchAdapter(rooms) { room ->
                        val bundle = Bundle().apply { putString("roomId", room.id) }
                        findNavController().navigate(R.id.partyRoomFragment, bundle)
                    }
                }
            }
        }
    }

    override fun onDestroyView() { super.onDestroyView(); _binding = null }
}

@HiltViewModel
class SearchViewModel @Inject constructor(
    private val userRepository: UserRepository,
    private val postgrest: Postgrest,
) : ViewModel() {
    private val _results = MutableStateFlow<List<FollowUser>>(emptyList())
    val results = _results.asStateFlow()

    private val _roomResults = MutableStateFlow<List<SearchRoomResult>>(emptyList())
    val roomResults = _roomResults.asStateFlow()

    private var searchJob: Job? = null
    private var searchType = "users"
    private var lastQuery = ""

    fun setSearchType(type: String) {
        searchType = type
        if (lastQuery.length >= 2) search(lastQuery)
    }

    fun search(query: String) {
        lastQuery = query
        searchJob?.cancel()
        if (query.length < 2) {
            _results.value = emptyList()
            _roomResults.value = emptyList()
            return
        }
        searchJob = viewModelScope.launch {
            delay(300) // Debounce
            try {
                when (searchType) {
                    "users" -> {
                        _results.value = userRepository.searchUsers(query)
                        _roomResults.value = emptyList()
                    }
                    "rooms" -> {
                        _results.value = emptyList()
                        _roomResults.value = postgrest.from("party_rooms")
                            .select(Columns.raw("id, name, cover_image_url, viewer_count, host_id, category")) {
                                filter {
                                    eq("is_active", true)
                                    ilike("name", "%$query%")
                                }
                                limit(20)
                            }
                            .decodeList()
                    }
                }
            } catch (_: Exception) {}
        }
    }
}

@Serializable
data class SearchRoomResult(
    val id: String,
    val name: String,
    val cover_image_url: String? = null,
    val viewer_count: Int = 0,
    val host_id: String? = null,
    val category: String? = null,
)

// ====== Room Search Adapter ======
class RoomSearchAdapter(
    private val rooms: List<SearchRoomResult>,
    private val onClick: (SearchRoomResult) -> Unit,
) : androidx.recyclerview.widget.RecyclerView.Adapter<RoomSearchAdapter.VH>() {

    inner class VH(view: View) : androidx.recyclerview.widget.RecyclerView.ViewHolder(view) {
        val tvName: TextView = view.findViewById(R.id.tvName)
        val tvLevel: TextView = view.findViewById(R.id.tvLevel)
        val tvCountry: TextView = view.findViewById(R.id.tvCountry)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        return VH(LayoutInflater.from(parent.context).inflate(R.layout.item_user, parent, false))
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val room = rooms[position]
        holder.tvName.text = "🎉 ${room.name}"
        holder.tvLevel.text = "👥 ${room.viewer_count}"
        holder.tvCountry.text = room.category ?: ""
        holder.itemView.setOnClickListener { onClick(room) }
    }

    override fun getItemCount() = rooms.size
}

// ====== User Search Adapter ======
class UserSearchAdapter(
    private val users: List<FollowUser>,
    private val onClick: (FollowUser) -> Unit,
) : androidx.recyclerview.widget.RecyclerView.Adapter<UserSearchAdapter.VH>() {

    inner class VH(val binding: com.merilive.app.databinding.ItemUserBinding) :
        androidx.recyclerview.widget.RecyclerView.ViewHolder(binding.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        return VH(com.merilive.app.databinding.ItemUserBinding.inflate(
            LayoutInflater.from(parent.context), parent, false))
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val user = users[position]
        holder.binding.apply {
            tvName.text = user.display_name ?: "User"
            tvLevel.text = "Lv.${user.user_level ?: 1}"
            tvCountry.text = user.country_flag ?: ""
            root.setOnClickListener { onClick(user) }
        }
    }

    override fun getItemCount() = users.size
}
