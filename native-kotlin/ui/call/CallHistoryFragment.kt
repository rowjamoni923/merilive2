package com.merilive.app.ui.call

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import com.merilive.app.R
import com.merilive.app.databinding.FragmentSimpleListBinding
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch

@AndroidEntryPoint
class CallHistoryFragment : Fragment() {

    private var _binding: FragmentSimpleListBinding? = null
    private val binding get() = _binding!!
    private val viewModel: CallViewModel by viewModels()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentSimpleListBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.tvTitle.text = "Call History"
        binding.btnBack.setOnClickListener { findNavController().navigateUp() }
        binding.rvItems.layoutManager = LinearLayoutManager(requireContext())

        viewModel.loadCallHistory()
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.callHistory.collect { items ->
                binding.rvItems.adapter = CallHistoryAdapter(items) { item ->
                    val bundle = Bundle().apply { putString("userId", item.host_id) }
                    findNavController().navigate(R.id.userProfileFragment, bundle)
                }
                binding.tvEmpty.visibility = if (items.isEmpty()) View.VISIBLE else View.GONE
            }
        }
    }

    override fun onDestroyView() { super.onDestroyView(); _binding = null }
}
