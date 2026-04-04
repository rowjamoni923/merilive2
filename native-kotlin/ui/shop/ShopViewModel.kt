package com.merilive.app.ui.shop

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.merilive.app.data.model.ShopItem
import com.merilive.app.data.repository.UserRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ShopViewModel @Inject constructor(
    private val userRepository: UserRepository,
) : ViewModel() {

    private val _items = MutableLiveData<List<ShopItem>>()
    val items: LiveData<List<ShopItem>> = _items

    private val _isLoading = MutableLiveData(false)
    val isLoading: LiveData<Boolean> = _isLoading

    fun loadShopItems(category: String = "all") {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                _items.value = userRepository.getShopItems(category)
            } catch (_: Exception) {
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun purchaseItem(itemId: String) {
        viewModelScope.launch {
            try {
                userRepository.purchaseShopItem(itemId)
                loadShopItems()
            } catch (_: Exception) {}
        }
    }
}
