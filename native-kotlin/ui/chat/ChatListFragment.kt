package com.merilive.app.ui.chat

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import com.merilive.app.R
import com.merilive.app.databinding.FragmentChatListBinding
import com.merilive.app.data.model.Conversation
import com.merilive.app.ui.chat.adapter.ConversationAdapter
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.postgresChangeFlow
import io.github.jan.supabase.realtime.PostgresAction
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import javax.inject.Inject

@AndroidEntryPoint
class ChatListFragment : Fragment() {

    private var _binding: FragmentChatListBinding? = null
    private val binding get() = _binding!!
    private val viewModel: ChatListViewModel by viewModels()
    private lateinit var adapter: ConversationAdapter

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentChatListBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnBack.setOnClickListener { findNavController().navigateUp() }
        binding.rvConversations.layoutManager = LinearLayoutManager(requireContext())

        adapter = ConversationAdapter { conv ->
            val bundle = Bundle().apply {
                putString("conversationId", conv.id)
                putString("otherUserId", conv.otherUserId)
                putString("otherUserName", conv.otherUserName)
                putString("otherUserAvatar", conv.otherUserAvatar)
            }
            findNavController().navigate(R.id.action_chatList_to_chatDetail, bundle)
        }
        binding.rvConversations.adapter = adapter

        viewModel.loadConversations()
        observeState()
    }

    private fun observeState() {
        viewLifecycleOwner.lifecycleScope.launchWhenStarted {
            viewModel.conversations.collect { conversations ->
                if (conversations.isEmpty()) {
                    binding.emptyState.visibility = View.VISIBLE
                    binding.rvConversations.visibility = View.GONE
                } else {
                    binding.emptyState.visibility = View.GONE
                    binding.rvConversations.visibility = View.VISIBLE
                    adapter.submitList(conversations)
                }
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}

@HiltViewModel
class ChatListViewModel @Inject constructor(
    private val auth: Auth,
    private val postgrest: Postgrest,
    private val realtime: Realtime,
) : ViewModel() {

    private val _conversations = MutableStateFlow<List<Conversation>>(emptyList())
    val conversations = _conversations.asStateFlow()

    fun loadConversations() {
        viewModelScope.launch {
            try {
                val userId = auth.currentSessionOrNull()?.user?.id ?: return@launch

                // DB uses participant_1, participant_2 — no last_message column
                val result = postgrest.from("conversations")
                    .select(Columns.raw("""
                        id,
                        participant_1, participant_2,
                        last_message_at,
                        user1:profiles_public!conversations_participant_1_fkey(id, display_name, avatar_url, is_online),
                        user2:profiles_public!conversations_participant_2_fkey(id, display_name, avatar_url, is_online)
                    """.trimIndent())) {
                        filter {
                            or {
                                eq("participant_1", userId)
                                eq("participant_2", userId)
                            }
                        }
                        order("last_message_at", Order.DESCENDING)
                    }
                    .decodeList<ChatConversationResponse>()

                // Get latest message per conversation for display
                val convIds = result.map { it.id }
                val latestMessages = if (convIds.isNotEmpty()) {
                    try {
                        // Get last message for each conversation
                        postgrest.from("messages")
                            .select(Columns.raw("conversation_id, content, message_type")) {
                                filter {
                                    isIn("conversation_id", convIds)
                                }
                                order("created_at", Order.DESCENDING)
                            }
                            .decodeList<LatestMessageResponse>()
                            .distinctBy { it.conversation_id }
                            .associate { it.conversation_id to it }
                    } catch (_: Exception) { emptyMap() }
                } else emptyMap()

                // Get unread counts per conversation
                val unreadCounts = try {
                    postgrest.from("messages")
                        .select(Columns.raw("conversation_id, count(*)")) {
                            filter {
                                neq("sender_id", userId)
                                eq("is_read", false)
                            }
                        }
                        .decodeList<UnreadCountResponse>()
                        .associate { it.conversation_id to (it.count ?: 0) }
                } catch (_: Exception) { emptyMap() }

                _conversations.value = result.map { conv ->
                    val isUser1 = conv.participant_1 == userId
                    val other = if (isUser1) conv.user2 else conv.user1
                    val lastMsg = latestMessages[conv.id]
                    val displayMessage = when (lastMsg?.message_type) {
                        "image" -> "📷 Photo"
                        "gift" -> "🎁 Gift"
                        "call" -> "📞 Call"
                        else -> lastMsg?.content
                    }
                    Conversation(
                        id = conv.id,
                        otherUserId = other?.id ?: "",
                        otherUserName = other?.display_name,
                        otherUserAvatar = other?.avatar_url,
                        lastMessage = displayMessage,
                        lastMessageTime = conv.last_message_at,
                        unreadCount = unreadCounts[conv.id] ?: 0,
                        isOnline = other?.is_online ?: false,
                    )
                }

                subscribeToConversations(userId)
            } catch (e: Exception) {
                // Handle error
            }
        }
    }

    private fun subscribeToConversations(userId: String) {
        viewModelScope.launch {
            try {
                val channel = realtime.channel("chat-list-$userId")
                val flow = channel.postgresChangeFlow<PostgresAction>(schema = "public") {
                    table = "conversations"
                }
                channel.subscribe()
                flow.collect { loadConversations() }
            } catch (_: Exception) {}
        }
    }
}

@Serializable
data class ChatConversationResponse(
    val id: String,
    val participant_1: String,
    val participant_2: String,
    val last_message_at: String? = null,
    val user1: ChatConversationUser? = null,
    val user2: ChatConversationUser? = null,
)

@Serializable
data class ChatConversationUser(
    val id: String,
    val display_name: String? = null,
    val avatar_url: String? = null,
    val is_online: Boolean? = null,
)

@Serializable
data class UnreadCountResponse(
    val conversation_id: String,
    val count: Int? = null,
)

@Serializable
data class LatestMessageResponse(
    val conversation_id: String,
    val content: String? = null,
    val message_type: String? = null,
)
