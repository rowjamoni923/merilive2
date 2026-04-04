package com.merilive.app.ui.home

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.ViewModel
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.viewModelScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.PagerSnapHelper
import androidx.recyclerview.widget.RecyclerView
import com.merilive.app.R
import com.merilive.app.databinding.FragmentHomeBinding
import com.merilive.app.data.repository.*
import com.merilive.app.ui.home.adapter.BannerAdapter
import com.merilive.app.ui.home.adapter.LiveStreamAdapter
import com.merilive.app.ui.home.adapter.PartyRoomAdapter
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class HomeFragment : Fragment() {

    private var _binding: FragmentHomeBinding? = null
    private val binding get() = _binding!!
    private val viewModel: HomeViewModel by viewModels()

    // Banner auto-scroll
    private val autoScrollHandler = Handler(Looper.getMainLooper())
    private var currentBannerPosition = 0
    private var totalBanners = 0
    private val autoScrollRunnable = object : Runnable {
        override fun run() {
            if (totalBanners > 1) {
                currentBannerPosition = (currentBannerPosition + 1) % totalBanners
                binding.rvBanners.smoothScrollToPosition(currentBannerPosition)
                autoScrollHandler.postDelayed(this, 4000L)
            }
        }
    }

    // Current tab & country filter
    private var currentTab = "popular"
    private var currentCountry: String? = null

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentHomeBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        setupRecyclerViews()
        setupTabs()
        setupCountryChips()
        setupClickListeners()
        viewModel.loadHomeData()
        observeState()
    }

    private fun setupRecyclerViews() {
        // Banner: horizontal snap-scroll with auto-scroll
        val bannerLayoutManager = LinearLayoutManager(requireContext(), LinearLayoutManager.HORIZONTAL, false)
        binding.rvBanners.layoutManager = bannerLayoutManager
        PagerSnapHelper().attachToRecyclerView(binding.rvBanners)

        // Track manual scroll to reset auto-scroll position
        binding.rvBanners.addOnScrollListener(object : RecyclerView.OnScrollListener() {
            override fun onScrollStateChanged(recyclerView: RecyclerView, newState: Int) {
                if (newState == RecyclerView.SCROLL_STATE_IDLE) {
                    currentBannerPosition = bannerLayoutManager.findFirstCompletelyVisibleItemPosition()
                    if (currentBannerPosition < 0) currentBannerPosition = 0
                }
                if (newState == RecyclerView.SCROLL_STATE_DRAGGING) {
                    autoScrollHandler.removeCallbacks(autoScrollRunnable)
                } else if (newState == RecyclerView.SCROLL_STATE_IDLE) {
                    startAutoScroll()
                }
            }
        })

        binding.rvLiveStreams.layoutManager = GridLayoutManager(requireContext(), 2)
        binding.rvPartyRooms.layoutManager = LinearLayoutManager(requireContext(), LinearLayoutManager.HORIZONTAL, false)
    }

    private fun setupTabs() {
        val tabs = listOf(binding.tabPopular, binding.tabLive, binding.tabNew, binding.tabFollow)

        fun selectTab(selected: TextView, tabKey: String) {
            tabs.forEach { tab ->
                val isSelected = tab == selected
                tab.isSelected = isSelected
                tab.setTextColor(resources.getColor(
                    if (isSelected) R.color.text_primary else R.color.text_secondary,
                    null
                ))
                tab.setTypeface(null, if (isSelected) android.graphics.Typeface.BOLD else android.graphics.Typeface.NORMAL)
                tab.background = if (isSelected) {
                    resources.getDrawable(R.drawable.bg_primary_button, null)
                } else {
                    null
                }
            }
            currentTab = tabKey
            filterStreams()
        }

        binding.tabPopular.setOnClickListener { selectTab(binding.tabPopular, "popular") }
        binding.tabLive.setOnClickListener { selectTab(binding.tabLive, "live") }
        binding.tabNew.setOnClickListener { selectTab(binding.tabNew, "new") }
        binding.tabFollow.setOnClickListener { selectTab(binding.tabFollow, "follow") }

        selectTab(binding.tabPopular, "popular")
    }

    private fun setupCountryChips() {
        val chipMap = mapOf(
            binding.chipAll to null,
            binding.chipBD to "BD",
            binding.chipIN to "IN",
            binding.chipPK to "PK",
            binding.chipNP to "NP",
            binding.chipSA to "SA",
        )

        chipMap.forEach { (chip, country) ->
            chip.setOnClickListener {
                chipMap.keys.forEach { c -> c.isChecked = (c == chip) }
                currentCountry = country
                filterStreams()
            }
        }
    }

    private fun filterStreams() {
        val state = viewModel.homeState.value
        if (state is HomeState.Success) {
            var filtered = state.streams

            // Filter by country
            if (currentCountry != null) {
                filtered = filtered.filter {
                    it.host_country_flag?.contains(currentCountry!!, ignoreCase = true) == true
                }
            }

            // Sort by tab
            filtered = when (currentTab) {
                "popular" -> filtered.sortedByDescending { it.viewer_count }
                "live" -> filtered // already live
                "new" -> filtered.sortedByDescending { it.id } // newest first
                "follow" -> filtered // TODO: filter by followed hosts
                else -> filtered
            }

            binding.rvLiveStreams.adapter = LiveStreamAdapter(filtered) { stream ->
                val bundle = Bundle().apply { putString("streamId", stream.id) }
                findNavController().navigate(R.id.action_home_to_liveStream, bundle)
            }
        }
    }

    private fun setupClickListeners() {
        binding.btnSearch.setOnClickListener { findNavController().navigate(R.id.action_home_to_search) }
        binding.btnLeaderboard.setOnClickListener { findNavController().navigate(R.id.action_home_to_leaderboard) }
        binding.swipeRefresh.setOnRefreshListener {
            viewModel.loadHomeData()
        }
    }

    private fun observeState() {
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.homeState.collect { state ->
                binding.swipeRefresh.isRefreshing = false
                when (state) {
                    is HomeState.Loading -> binding.progressBar.visibility = View.VISIBLE
                    is HomeState.Success -> {
                        binding.progressBar.visibility = View.GONE

                        // Banners with click handler + auto-scroll
                        totalBanners = state.banners.size
                        binding.rvBanners.adapter = BannerAdapter(state.banners) { banner ->
                            handleBannerClick(banner)
                        }
                        startAutoScroll()

                        // Apply current tab/country filter
                        filterStreams()

                        binding.tvOnlineCount.text = "${state.streams.size} Live"
                    }
                    is HomeState.Error -> {
                        binding.progressBar.visibility = View.GONE
                    }
                }
            }
        }
    }

    private fun handleBannerClick(banner: BannerResponse) {
        val url = banner.link_url ?: return
        when (banner.link_type?.lowercase()) {
            "live" -> {
                val bundle = Bundle().apply { putString("streamId", url) }
                findNavController().navigate(R.id.action_home_to_liveStream, bundle)
            }
            "party" -> {
                val bundle = Bundle().apply { putString("roomId", url) }
                findNavController().navigate(R.id.action_home_to_partyRoom, bundle)
            }
            "profile" -> {
                val bundle = Bundle().apply { putString("userId", url) }
                findNavController().navigate(R.id.action_home_to_userProfile, bundle)
            }
            "web", "external" -> {
                val intent = android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url))
                startActivity(intent)
            }
            "recharge" -> findNavController().navigate(R.id.action_home_to_recharge)
            "vip" -> findNavController().navigate(R.id.action_home_to_vip)
            "shop" -> findNavController().navigate(R.id.action_home_to_shop)
            else -> {
                if (url.startsWith("http")) {
                    val intent = android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url))
                    startActivity(intent)
                }
            }
        }
    }

    private fun startAutoScroll() {
        autoScrollHandler.removeCallbacks(autoScrollRunnable)
        if (totalBanners > 1) {
            autoScrollHandler.postDelayed(autoScrollRunnable, 4000L)
        }
    }

    override fun onResume() {
        super.onResume()
        startAutoScroll()
    }

    override fun onPause() {
        super.onPause()
        autoScrollHandler.removeCallbacks(autoScrollRunnable)
    }

    override fun onDestroyView() {
        autoScrollHandler.removeCallbacks(autoScrollRunnable)
        super.onDestroyView()
        _binding = null
    }
}

sealed class HomeState {
    object Loading : HomeState()
    data class Success(
        val banners: List<BannerResponse>,
        val streams: List<ActiveStream>,
        val partyRooms: List<PartyRoomResponse>,
    ) : HomeState()
    data class Error(val message: String) : HomeState()
}

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val liveRepository: LiveRepository,
) : ViewModel() {

    private val _homeState = MutableStateFlow<HomeState>(HomeState.Loading)
    val homeState = _homeState.asStateFlow()

    fun loadHomeData() {
        viewModelScope.launch {
            _homeState.value = HomeState.Loading
            try {
                val banners = async { liveRepository.getBanners() }
                val streams = async { liveRepository.getActiveStreams() }
                val rooms = async { liveRepository.getPartyRooms() }

                _homeState.value = HomeState.Success(
                    banners = banners.await(),
                    streams = streams.await(),
                    partyRooms = rooms.await(),
                )
            } catch (e: Exception) {
                _homeState.value = HomeState.Error(e.message ?: "Failed to load")
            }
        }
    }
}
