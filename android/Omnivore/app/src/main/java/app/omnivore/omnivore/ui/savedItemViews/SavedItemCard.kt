package app.omnivore.omnivore.ui.savedItemViews

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.colorResource
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.intl.Locale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.toLowerCase
import androidx.compose.ui.text.toUpperCase
import androidx.compose.ui.unit.*
import app.omnivore.omnivore.R
import app.omnivore.omnivore.persistence.entities.SavedItemLabel
import app.omnivore.omnivore.persistence.entities.SavedItemWithLabelsAndHighlights
import app.omnivore.omnivore.ui.components.LabelChip
import app.omnivore.omnivore.ui.components.LabelChipColors
import app.omnivore.omnivore.ui.library.SavedItemAction
import app.omnivore.omnivore.ui.library.SavedItemViewModel
import coil.compose.rememberAsyncImagePainter

@OptIn(ExperimentalFoundationApi::class, ExperimentalLayoutApi::class)
@Composable
fun SavedItemCard(
  selected: Boolean,
  savedItemViewModel: SavedItemViewModel,
  savedItem: SavedItemWithLabelsAndHighlights,
  onClickHandler: () -> Unit,
  actionHandler: (SavedItemAction) -> Unit) {
  // Log.d("selected", "is selected: ${selected}")

  Column(
      modifier = Modifier
        .combinedClickable(
          onClick = onClickHandler,
          onLongClick = {
            savedItemViewModel.actionsMenuItemLiveData.postValue(savedItem)
          }
        )
        .background(if (selected) MaterialTheme.colorScheme.surfaceVariant else MaterialTheme.colorScheme.background)
        .fillMaxWidth()
  ) {
    Row(
      horizontalArrangement = Arrangement.SpaceBetween,
      verticalAlignment = Alignment.Top,
      modifier = Modifier
        .fillMaxWidth()
        .padding(10.dp)
        .background(Color.Transparent)

    ) {
      Column(
        verticalArrangement = Arrangement.spacedBy(5.dp),
        modifier = Modifier
          .weight(1f, fill = false)
          .padding(end = 20.dp)
          .defaultMinSize(minHeight = 55.dp)
      ) {
        ReadInfo(item = savedItem)

        Text(
          text = savedItem.savedItem.title,
          style = TextStyle(
            fontSize = 18.sp,
            color = MaterialTheme.colorScheme.onBackground,
            fontWeight = FontWeight.SemiBold
          ),
          maxLines = 2,
          lineHeight = 20.sp
        )

        if (savedItem.savedItem.author != null && savedItem.savedItem.author != "") {
          Text(
            text = byline(savedItem),
            style = TextStyle(
              fontSize = 15.sp,
              fontWeight = FontWeight.Normal,
              color = Color(red = 137, green = 137, blue = 137)
            ),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
          )
        }
      }

      Image(
        painter = rememberAsyncImagePainter(savedItem.savedItem.imageURLString),
        contentDescription = "Image associated with saved item",
        modifier = Modifier
          .size(55.dp, 73.dp)
          .clip(RoundedCornerShape(10.dp))
          .defaultMinSize(minWidth = 55.dp, minHeight = 73.dp)
          .clip(RoundedCornerShape(10.dp))
      )
    }

    FlowRow(modifier = Modifier
      .fillMaxWidth()
      .padding(10.dp)) {
      savedItem.labels.filter { !isFlairLabel(it) }.sortedWith(compareBy { it.name.toLowerCase(Locale.current) }).forEach { label ->
        val chipColors = LabelChipColors.fromHex(label.color)

        LabelChip(
          name = label.name,
          colors = chipColors,
        )
      }
    }

    Divider(color = MaterialTheme.colorScheme.outlineVariant, thickness = 1.dp)
  }
}

fun byline(item: SavedItemWithLabelsAndHighlights): String {
  item.savedItem.author?.let {
    return item.savedItem.author
  }

  val publisherDisplayName = item.savedItem.publisherDisplayName()
  publisherDisplayName?.let {
    return publisherDisplayName
  }

  return ""
}

//
//var readingSpeed: Int64 {
//  var result = UserDefaults.standard.integer(forKey: UserDefaultKey.userWordsPerMinute.rawValue)
//  if result <= 0 {
//    result = 235
//  }
//  return Int64(result)
//}

fun estimatedReadingTime(item: SavedItemWithLabelsAndHighlights): String {
  item.savedItem.wordsCount?.let {
    if (it > 0) {
      val readLen = kotlin.math.max(1, it / 235)
      return "$readLen MIN READ • "
    }
  }
  return ""
}

fun readingProgress(item: SavedItemWithLabelsAndHighlights): String {
  // If there is no wordsCount don't show progress because it will make no sense
  item.savedItem.wordsCount?.let {
    if (it > 0) {
      val intVal = item.savedItem.readingProgress.toInt()
      return "$intVal%"
    }
  }
  return ""
}

//var highlightsText: String {
//  item.hig ?.let {
//  if let highlights = item.highlights, highlights.count > 0 {
//    let fmted = LocalText.pluralizedText(key: "number_of_highlights", count: highlights.count)
//    if item.wordsCount > 0 {
//      return " • \(fmted)"
//    }
//    return fmted
//  }
//  return ""
//}
//
//var notesText: String {
//  let notes = item.highlights?.filter { item in
//          if let highlight = item as? Highlight {
//            return !(highlight.annotation ?? "").isEmpty
//          }
//    return false
//  }
//
//  if let notes = notes, notes.count > 0 {
//    let fmted = LocalText.pluralizedText(key: "number_of_notes", count: notes.count)
//    if item.wordsCount > 0 {
//      return " • \(fmted)"
//    }
//    return fmted
//  }
//  return ""
//}


enum class FlairIcon(
  val rawValue: String,
  val sortOrder: Int
) {
  FEED("feed", 0),
  RSS("rss", 0),
  FAVORITE("favorite", 1),
  NEWSLETTER("newsletter", 2),
  RECOMMENDED("recommended", 3),
  PINNED("pinned", 4)
}

val FLAIR_ICON_NAMES = listOf("feed", "rss", "favorite", "newsletter", "recommended", "pinned")

fun isFlairLabel(label: SavedItemLabel): Boolean {
  return FLAIR_ICON_NAMES.contains(label.name.toLowerCase(Locale.current))
}

@Composable
fun flairIcons(item: SavedItemWithLabelsAndHighlights) {
  val labels = item.labels.filter { isFlairLabel(it) }.map {
    FlairIcon.valueOf(it.name.toUpperCase(Locale.current))
  }
  labels.forEach {
    when (it) {
      FlairIcon.RSS,
      FlairIcon.FEED -> {
        Image(
          painter = painterResource(id = R.drawable.flair_feed),
          contentDescription = "Feed flair Icon",
          modifier = Modifier
            .padding(end = 5.0.dp)
        )
      }

      FlairIcon.FAVORITE -> {
        Image(
          painter = painterResource(id = R.drawable.flaire_favorite),
          contentDescription = "Favorite flair Icon",
          modifier = Modifier
            .padding(end = 5.0.dp)
        )
      }

      FlairIcon.NEWSLETTER -> {
        Image(
          painter = painterResource(id = R.drawable.flair_newsletter),
          contentDescription = "Newsletter flair Icon",
          modifier = Modifier
            .padding(end = 5.0.dp)
        )
      }

      FlairIcon.RECOMMENDED -> {
        Image(
          painter = painterResource(id = R.drawable.flair_recommended),
          contentDescription = "Recommended flair Icon",
          modifier = Modifier
            .padding(end = 5.0.dp)
        )
      }

      FlairIcon.PINNED -> {
        Image(
          painter = painterResource(id = R.drawable.flair_pinned),
          contentDescription = "Pinned flair Icon",
                  modifier = Modifier
                    .padding(end = 5.0.dp)
        )
      }

    }
  }
}

@Composable
fun ReadInfo(item: SavedItemWithLabelsAndHighlights) {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .defaultMinSize(minHeight = 15.dp)
  ) {
    // Show flair here
    flairIcons(item)

    Text(
      text = estimatedReadingTime(item),
      style = TextStyle(
        fontSize = 11.sp,
        fontWeight = FontWeight.Medium,
        color = Color(red = 137, green = 137, blue = 137)
      ),
      maxLines = 1,
      overflow = TextOverflow.Ellipsis
    )

    Text(
      text = readingProgress(item),
      style = TextStyle(
        fontSize = 11.sp,
        fontWeight = FontWeight.Medium,
        color = if (item.savedItem.readingProgress > 1) colorResource(R.color.green_55B938) else colorResource(R.color.gray_898989)
      ),
      maxLines = 1,
      overflow = TextOverflow.Ellipsis
    )

//    Text("\(highlightsText)")
//
//    Text("\(notesText)")

  }
}
